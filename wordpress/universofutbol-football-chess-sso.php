<?php
/**
 * Plugin Name: UniversoFutbol Football Chess SSO
 * Description: ログイン済みのUniversoFutbol会員をワンタップでFootball Chess(Web版)へSSOログインさせる。ショートコード [football_chess_button] でプレイボタンを設置。
 * Version: 1.0.0
 * Author: GADE
 *
 * 導入手順:
 *   1. このファイルを wp-content/plugins/ に置いて有効化する。
 *   2. wp-config.php に共有シークレットを定義する（Cloudflare側の SSO_SECRET と同じ値）:
 *        define('UF_FC_SSO_SECRET', '<64文字のシークレット>');
 *      必要ならゲームURLも上書き可能:
 *        define('UF_FC_GAME_URL', 'https://universofutbol.com/universofutbol/football-chess');
 *   3. サブスク会員判定を自サイトの会員プラグインに合わせる場合は、テーマ等で
 *      add_filter('uf_fc_user_subscribed', fn($subscribed, $user_id) => 実判定, 10, 2);
 *
 * 仕様の詳細はゲームリポジトリの AUTH_UNIVERSOFUTBOL.md を参照。
 */

if (!defined('ABSPATH')) exit;

const UF_FC_QUERY_FLAG = 'uf_fc_play';

function uf_fc_game_url(): string {
    if (defined('UF_FC_GAME_URL')) return UF_FC_GAME_URL;
    // 正式ルーティング設定前は workers.dev を既定にする
    return 'https://universofutbol-football-chess.yanagiho.workers.dev/';
}

function uf_fc_base64url(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

/** HS256 JWT を発行する（有効期限60秒の短命トークン） */
function uf_fc_build_sso_token(int $user_id): ?string {
    if (!defined('UF_FC_SSO_SECRET') || UF_FC_SSO_SECRET === '') return null;
    $user = get_userdata($user_id);
    if (!$user) return null;

    $subscribed = (bool) apply_filters('uf_fc_user_subscribed', false, $user_id);

    $header  = uf_fc_base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = uf_fc_base64url(json_encode([
        'sub'        => (string) $user_id,
        'name'       => mb_substr($user->display_name ?: $user->user_login, 0, 16),
        'subscribed' => $subscribed,
        'exp'        => time() + 60,
    ], JSON_UNESCAPED_UNICODE));
    $sig = uf_fc_base64url(hash_hmac('sha256', "$header.$payload", UF_FC_SSO_SECRET, true));
    return "$header.$payload.$sig";
}

/** /?uf_fc_play=1 でゲームへSSOリダイレクト */
add_action('template_redirect', function () {
    if (empty($_GET[UF_FC_QUERY_FLAG])) return;

    $url = uf_fc_game_url();
    if (is_user_logged_in()) {
        $token = uf_fc_build_sso_token(get_current_user_id());
        if ($token !== null) {
            $url = add_query_arg('sso', $token, $url);
        }
    }
    // 未ログイン会員はゲスト起動（ゲーム側でログイン導線あり）
    wp_redirect($url);
    exit;
});

/** プレイボタン: [football_chess_button text="Football Chess をプレイ"] */
add_shortcode('football_chess_button', function ($atts) {
    $atts = shortcode_atts(['text' => 'Football Chess をプレイ'], $atts);
    $href = esc_url(add_query_arg(UF_FC_QUERY_FLAG, '1', home_url('/')));
    return '<a class="uf-fc-play-button" href="' . $href . '" '
        . 'style="display:inline-block;padding:12px 28px;border-radius:10px;'
        . 'background:linear-gradient(180deg,#5db6ff,#1f7be0);color:#fff;'
        . 'font-weight:bold;text-decoration:none;">'
        . esc_html($atts['text']) . '</a>';
});
