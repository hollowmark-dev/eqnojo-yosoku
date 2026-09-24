/**
 * 集計シート（非公開）。回答ログ responses から「集計」シートを作り直す。
 *
 * - シートを開くたびに自動で更新する。メニュー「推し予測 → 集計を更新」でも更新できる。
 * - responses には書き込まない（読むだけ）。doPost（Code.gs）とは独立している。
 * - メンバー別の表は人気ランキングに見えるため、外部に公開しない。
 *
 * 区分:
 *   旧・補正前  顔ID g000〜g094、ハブ補正の公開前（2026/09/23 19:47 より前）
 *   旧・補正後  顔ID g000〜g094、補正の公開後
 *   新セット    顔ID g100〜（2026/09/24 公開の66枚）
 * 1問も選ばなかった回答（旧版で記録されたもの）は的中率から除く。
 */
var CORRECTION_AT = '2026/09/23 19:47:08';   // ハブ補正を公開した時刻（JST）
var PHASES = ['旧・補正前', '旧・補正後', '新セット'];
var SHUFFLES = 300;                           // シャッフル基準の繰り返し回数
var MEMBERS = [
  ['M19', '大谷映美里', '＝LOVE'],
  ['M14', '大場花菜', '＝LOVE'],
  ['M20', '音嶋莉沙', '＝LOVE'],
  ['M22', '齋藤樹愛羅', '＝LOVE'],
  ['M24', '佐々木舞香', '＝LOVE'],
  ['M27', '髙松瞳', '＝LOVE'],
  ['M28', '瀧脇笙古', '＝LOVE'],
  ['M13', '野口衣織', '＝LOVE'],
  ['M10', '諸橋沙夏', '＝LOVE'],
  ['M32', '山本杏奈', '＝LOVE'],
  ['M16', '尾木波菜', '≠ME'],
  ['M15', '落合希来里', '≠ME'],
  ['M07', '蟹沢萌子', '≠ME'],
  ['M08', '河口夏音', '≠ME'],
  ['M09', '川中子奈月心', '≠ME'],
  ['M23', '櫻井もも', '≠ME'],
  ['M25', '鈴木瞳美', '≠ME'],
  ['M29', '谷崎早耶', '≠ME'],
  ['M30', '冨田菜々風', '≠ME'],
  ['M12', '永田詩央里', '≠ME'],
  ['M05', '本田珠由記', '≠ME'],
  ['M01', '逢田珠里依', '≒JOY'],
  ['M02', '天野香乃愛', '≒JOY'],
  ['M06', '市原愛弓', '≒JOY'],
  ['M03', '江角怜音', '≒JOY'],
  ['M18', '大信田美月', '≒JOY'],
  ['M17', '大西葵', '≒JOY'],
  ['M21', '小澤愛実', '≒JOY'],
  ['M26', '髙橋舞', '≒JOY'],
  ['M04', '藤沢莉子', '≒JOY'],
  ['M11', '村山結香', '≒JOY'],
  ['M31', '山田杏佳', '≒JOY'],
  ['M33', '山野愛月', '≒JOY']
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('推し予測')
    .addItem('集計を更新', 'updateDashboard').addToUi();
  try { updateDashboard(); } catch (e) {}
}

function comb(n, k) { var r = 1; for (var i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }
function toks(s) { return String(s || '').split(' ').filter(function (x) { return x; }); }
function fmtTs(v) {
  return v instanceof Date
    ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss') : String(v);
}
function phaseOf(ts, picks) {
  if (picks.some(function (g) { return /^g1\d\d$/.test(g); })) return '新セット';
  return ts < CORRECTION_AT ? '旧・補正前' : '旧・補正後';
}
function hit(P, O) { return P.some(function (m) { return O.indexOf(m) >= 0; }) ? 1 : 0; }

// 推しを入力した回答だけで: 実際の的中率・偶然の的中率・シャッフル基準
function hitStats(rs) {
  var n = rs.length;
  if (!n) return { n: 0, hit: '', chance: '', shuffled: '' };
  var h = 0, e = 0;
  rs.forEach(function (r) { h += hit(r.P, r.O); e += 1 - comb(33 - r.O.length, 3) / comb(33, 3); });
  var props = rs.map(function (r) { return r.P; }), sum = 0;
  for (var s = 0; s < SHUFFLES; s++) {
    var p = props.slice();
    for (var i = p.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = p[i]; p[i] = p[j]; p[j] = t; }
    rs.forEach(function (r, i) { sum += hit(p[i], r.O); });
  }
  return { n: n, hit: h / n, chance: e / n, shuffled: sum / SHUFFLES / n };
}

function updateDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName('responses');
  var rows = src ? src.getDataRange().getValues().slice(1) : [];
  var sh = ss.getSheetByName('集計') || ss.insertSheet('集計');
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();

  var by = {}, day = {}, oshiAll = {}, skipped = 0;
  PHASES.forEach(function (p) { by[p] = { rows: [], withO: [], prop: {} }; });
  rows.forEach(function (r) {
    var ts = fmtTs(r[0]); if (!ts) return;
    var picks = toks(r[1]).filter(function (g) { return g; }), O = toks(r[2]), P = toks(r[3]);
    var d = ts.slice(0, 10); day[d] = (day[d] || 0) + 1;
    if (!picks.length) { skipped++; return; }
    var b = by[phaseOf(ts, picks)];
    b.rows.push(1);
    P.forEach(function (m) { b.prop[m] = (b.prop[m] || 0) + 1; });
    O.forEach(function (m) { oshiAll[m] = (oshiAll[m] || 0) + 1; });
    if (O.length) b.withO.push({ P: P, O: O });
  });
  var st = {}; PHASES.forEach(function (p) { st[p] = hitStats(by[p].withO); });

  sh.getRange('A1').setValue('イコノイジョイ推し予測 集計（非公開・外に出さない）').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('更新: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));

  // 概要
  var sum = [[''].concat(PHASES),
    ['回答数（1問以上回答）'].concat(PHASES.map(function (p) { return by[p].rows.length; })),
    ['推しの入力あり'].concat(PHASES.map(function (p) { return st[p].n; })),
    ['的中率（推しが提案3人に入った割合）'].concat(PHASES.map(function (p) { return st[p].hit; })),
    ['シャッフル基準（他人の提案と組み替えた場合）'].concat(PHASES.map(function (p) { return st[p].shuffled; })),
    ['偶然の的中率（でたらめに3人選んだ場合）'].concat(PHASES.map(function (p) { return st[p].chance; }))];
  sh.getRange(4, 1, sum.length, 4).setValues(sum);
  sh.getRange(4, 1, 1, 4).setFontWeight('bold');
  sh.getRange(7, 2, 3, 3).setNumberFormat('0%');
  sh.getRange('A11').setValue('全問スキップ（旧版で記録、集計から除外）: ' + skipped + ' 件');
  sh.getRange('A12').setValue('的中率が「シャッフル基準」を上回っていれば、人気や偏りでは説明できない分だけ好みを読めている。区分ごとに100件以上を目安に判断する。');

  // 的中率の比較（グラフ用）
  var hv = [['', '的中率', 'シャッフル基準', '偶然']].concat(PHASES.map(function (p) {
    return [p + '（n=' + st[p].n + '）', st[p].hit || 0, st[p].shuffled || 0, st[p].chance || 0];
  }));
  sh.getRange(14, 1, hv.length, 4).setValues(hv);
  sh.getRange(15, 2, 3, 3).setNumberFormat('0%');

  // 日別
  var days = Object.keys(day).sort();
  var dv = [['日付', '回答数']].concat(days.map(function (d) { return [d, day[d]]; }));
  sh.getRange(20, 1, dv.length, 2).setValues(dv);

  // メンバー別：各区分で提案3人に入った割合（その区分の回答数に対する%）と、推しに選ばれた回数
  var nOld = by['旧・補正後'].rows.length, nNew = by['新セット'].rows.length;
  var mv = [['メンバー', '提案に入った割合（旧・補正後）', '提案に入った割合（新セット）', '推しに選ばれた回数（全体）']]
    .concat(MEMBERS.map(function (m) {
      return [m[1] + '（' + m[2] + '）',
              nOld ? (by['旧・補正後'].prop[m[0]] || 0) / nOld : 0,
              nNew ? (by['新セット'].prop[m[0]] || 0) / nNew : 0,
              oshiAll[m[0]] || 0];
    }));
  var mr = 20 + dv.length + 2;
  sh.getRange(mr, 1, mv.length, 4).setValues(mv);
  sh.getRange(mr + 1, 2, mv.length - 1, 2).setNumberFormat('0%');
  [4, 14, 20, mr].forEach(function (r) { sh.getRange(r, 1, 1, 4).setFontWeight('bold'); });
  sh.setColumnWidth(1, 300);

  // グラフ
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange(14, 1, hv.length, 4)).setPosition(4, 6, 0, 0)
    .setOption('title', '的中率：実際 vs シャッフル基準 vs 偶然（区分別）')
    .setOption('vAxis', { format: 'percent', minValue: 0 }).setOption('width', 600).setOption('height', 320).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange(20, 1, dv.length, 2)).setPosition(22, 6, 0, 0)
    .setOption('title', '日別の回答数').setOption('legend', { position: 'none' })
    .setOption('width', 600).setOption('height', 260).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.BAR)
    .addRange(sh.getRange(mr, 1, mv.length, 3)).setPosition(37, 6, 0, 0)
    .setOption('title', 'メンバー別：提案3人に入った割合（旧・補正後 vs 新セット）')
    .setOption('hAxis', { format: 'percent', minValue: 0 })
    .setOption('width', 660).setOption('height', 860).build());
}
