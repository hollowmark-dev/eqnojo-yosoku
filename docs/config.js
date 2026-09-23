/* ここだけ編集すれば設定は完了します。
 *
 * brand    サイト名。タイトル・見出し・ハッシュタグ（#＋この名前）に
 *          使われます。「イコノイジョイ推し予測」など、あとから差し替え
 *          られるようにここ1箇所に置いています。
 *
 * siteUrl  公開URL（末尾のスラッシュは付けても付けなくても可）。
 *          例: "https://hollowmark-dev.github.io/eqnojo-yosoku/"
 *          空のままでも動きます。その場合シェア時は、そのとき開いて
 *          いるページのURLを使います。
 *          ⚠ Xのカード画像を出すには、ここを設定する必要があります。
 *
 * endpoint 回答を記録するGoogle Apps ScriptのURL（gas/README.md 参照）。
 *          空のままなら、何も送信されません。エラーも出ません。
 *
 * ⚠ brand と siteUrl を変えたら build_docs.py を実行してください。
 *    OGPタグ（Xのカード）はHTMLに静的に書く必要があり、クローラは
 *    JavaScriptを読まないためです。check_publish.py がずれを検出します。
 */
const CONFIG = {
  brand: "イコノイジョイ推し予測",
  siteUrl: "https://hollowmark-dev.github.io/eqnojo-yosoku/",
  endpoint: ""
};
