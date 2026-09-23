/**
 * 集計シート（非公開）。回答ログ responses から「集計」シートを作り直す。
 *
 * - シートを開くたびに自動で更新する。メニュー「推し予測 → 集計を更新」でも更新できる。
 * - responses には書き込まない（読むだけ）。doPost（Code.gs）とは独立している。
 * - メンバー別の表は人気ランキングに見えるため、外部に公開しない。
 */
var CORRECTION_AT = '2026/09/23 19:47:08';   // ハブ補正を公開した時刻（JST）
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

function updateDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName('responses');
  var rows = src ? src.getDataRange().getValues().slice(1) : [];
  var sh = ss.getSheetByName('集計') || ss.insertSheet('集計');
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();

  var ph = { '補正前': { n: 0, o: 0, hit: 0, exp: 0 }, '補正後': { n: 0, o: 0, hit: 0, exp: 0 } };
  var day = {}, prop = {}, oshi = {}, done = 0;
  rows.forEach(function (r) {
    var ts = fmtTs(r[0]); if (!ts) return;
    var P = toks(r[3]), O = toks(r[2]), k = O.length;
    var p = ph[ts < CORRECTION_AT ? '補正前' : '補正後'];
    p.n++; if (Number(r[4]) === 1) done++;
    var d = ts.slice(0, 10); day[d] = (day[d] || 0) + 1;
    P.forEach(function (m) { prop[m] = (prop[m] || 0) + 1; });
    O.forEach(function (m) { oshi[m] = (oshi[m] || 0) + 1; });
    if (k) {
      p.o++;
      if (P.some(function (m) { return O.indexOf(m) >= 0; })) p.hit++;
      p.exp += 1 - comb(33 - k, 3) / comb(33, 3);
    }
  });
  var all = { n: ph['補正前'].n + ph['補正後'].n, o: ph['補正前'].o + ph['補正後'].o,
              hit: ph['補正前'].hit + ph['補正後'].hit, exp: ph['補正前'].exp + ph['補正後'].exp };
  var pct = function (a, b) { return b ? a / b : ''; };

  sh.getRange('A1').setValue('イコノイジョイ推し予測 集計（非公開・外に出さない）').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('更新: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));

  // 概要
  var sum = [['', '全体', '補正前', '補正後'],
    ['回答数', all.n, ph['補正前'].n, ph['補正後'].n],
    ['推しの入力あり', all.o, ph['補正前'].o, ph['補正後'].o],
    ['推しが3人に入った回答', all.hit, ph['補正前'].hit, ph['補正後'].hit],
    ['偶然でも入る見込み（件）', all.exp, ph['補正前'].exp, ph['補正後'].exp],
    ['的中率', pct(all.hit, all.o), pct(ph['補正前'].hit, ph['補正前'].o), pct(ph['補正後'].hit, ph['補正後'].o)],
    ['偶然の的中率', pct(all.exp, all.o), pct(ph['補正前'].exp, ph['補正前'].o), pct(ph['補正後'].exp, ph['補正後'].o)]];
  sh.getRange(4, 1, sum.length, 4).setValues(sum);
  sh.getRange(4, 1, 1, 4).setFontWeight('bold');
  sh.getRange(8, 2, 1, 3).setNumberFormat('0.0');
  sh.getRange(9, 2, 2, 3).setNumberFormat('0%');
  sh.getRange('A11').setValue('完走数: ' + done + ' ／ 的中率が「偶然の的中率」を上回り続ければ、好みを予測できている。100件以上たまるまでは判断しない。');

  // 的中率 vs 偶然（グラフ用）
  var hv = [['', '実際', '偶然']];
  ['全体', '補正後'].forEach(function (k) {
    var p = k === '全体' ? all : ph[k];
    hv.push([k, p.o ? p.hit / p.o : 0, p.o ? p.exp / p.o : 0]);
  });
  sh.getRange(13, 1, hv.length, 3).setValues(hv);
  sh.getRange(14, 2, 2, 2).setNumberFormat('0%');

  // 日別
  var days = Object.keys(day).sort();
  var dv = [['日付', '回答数']].concat(days.map(function (d) { return [d, day[d]]; }));
  sh.getRange(18, 1, dv.length, 2).setValues(dv);

  // メンバー別（ロースター順）
  var mv = [['メンバー', '提案された回数', '推しに選ばれた回数']].concat(MEMBERS.map(function (m) {
    return [m[1] + '（' + m[2] + '）', prop[m[0]] || 0, oshi[m[0]] || 0];
  }));
  var mr = 18 + dv.length + 2;
  sh.getRange(mr, 1, mv.length, 3).setValues(mv);
  [4, 13, 18, mr].forEach(function (r) { sh.getRange(r, 1, 1, 4).setFontWeight('bold'); });
  sh.setColumnWidth(1, 230);

  // グラフ
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange(13, 1, hv.length, 3)).setPosition(4, 6, 0, 0)
    .setOption('title', '的中率（推しが提案3人に入った割合） 実際 vs 偶然')
    .setOption('vAxis', { format: 'percent', minValue: 0 }).setOption('width', 520).setOption('height', 300).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange(18, 1, dv.length, 2)).setPosition(20, 6, 0, 0)
    .setOption('title', '日別の回答数').setOption('legend', { position: 'none' })
    .setOption('width', 520).setOption('height', 260).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.BAR)
    .addRange(sh.getRange(mr, 1, mv.length, 3)).setPosition(35, 6, 0, 0)
    .setOption('title', 'メンバー別：提案された回数と推しに選ばれた回数')
    .setOption('width', 620).setOption('height', 820).build());
}
