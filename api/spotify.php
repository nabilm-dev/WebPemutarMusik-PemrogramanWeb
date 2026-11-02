<?php
/**
 * RAMPHONY SPOTIFY METADATA PROXY (PHP)
 * - Fetches Spotify OAuth token using Client Credentials Flow
 * - Caches access_token locally
 * - Returns clean track list with 640px cover art and artist info
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Check credentials from GET / Environment or Default Settings
$configFile = __DIR__ . '/spotify_config.json';
$config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];

$clientId = $_GET['client_id'] ?? ($config['client_id'] ?? getenv('SPOTIFY_CLIENT_ID') ?: '');
$clientSecret = $_GET['client_secret'] ?? ($config['client_secret'] ?? getenv('SPOTIFY_CLIENT_SECRET') ?: '');

$query = trim($_GET['q'] ?? '');
if (empty($query)) {
    echo json_encode(['success' => false, 'error' => 'Query parameter "q" is required', 'tracks' => []]);
    exit;
}

// Save credentials if passed via POST / setup
if (isset($_GET['save_config']) && !empty($_GET['client_id']) && !empty($_GET['client_secret'])) {
    file_put_contents($configFile, json_encode([
        'client_id' => $_GET['client_id'],
        'client_secret' => $_GET['client_secret']
    ]));
}

function getSpotifyToken($id, $secret) {
    if (empty($id) || empty($secret)) {
        return null;
    }

    $cacheFile = sys_get_temp_dir() . '/ramphony_spotify_token.json';
    if (file_exists($cacheFile)) {
        $cached = json_decode(@file_get_contents($cacheFile), true);
        if ($cached && isset($cached['expires_at']) && time() < $cached['expires_at']) {
            return $cached['access_token'];
        }
    }

    $ch = curl_init('https://accounts.spotify.com/api/token');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, 'grant_type=client_credentials');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Basic ' . base64_encode($id . ':' . $secret),
        'Content-Type: application/x-www-form-urlencoded'
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);

    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status === 200 && $response) {
        $data = json_decode($response, true);
        if (isset($data['access_token'])) {
            $data['expires_at'] = time() + ($data['expires_in'] ?? 3600) - 60;
            @file_put_contents($cacheFile, json_encode($data));
            return $data['access_token'];
        }
    }
    return null;
}

$token = getSpotifyToken($clientId, $clientSecret);

if (!$token) {
    // If Spotify credentials are not configured yet, notify client to use direct search
    echo json_encode([
        'success' => false,
        'configured' => false,
        'message' => 'Spotify credentials not set. Use YouTube / Saavn direct engine.',
        'tracks' => []
    ]);
    exit;
}

$searchUrl = 'https://api.spotify.com/v1/search?q=' . urlencode($query) . '&type=track&limit=25';
$ch = curl_init($searchUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $token
]);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 7);
$res = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200 && $res) {
    $spotifyData = json_decode($res, true);
    $items = $spotifyData['tracks']['items'] ?? [];
    $formatted = [];

    foreach ($items as $item) {
        $artists = array_map(function($a) { return $a['name']; }, $item['artists'] ?? []);
        $artistStr = implode(', ', $artists);
        $title = $item['name'] ?? '';
        $albumArt = $item['album']['images'][0]['url'] ?? null;
        $durationMs = $item['duration_ms'] ?? 0;
        $durationSec = round($durationMs / 1000);
        $min = floor($durationSec / 60);
        $sec = str_pad($durationSec % 60, 2, '0', STR_PAD_LEFT);

        $formatted[] = [
            'id' => $item['id'],
            'title' => $title,
            'artist' => $artistStr,
            'name' => $artistStr . ' - ' . $title,
            'duration' => $min . ':' . $sec,
            'durationSec' => $durationSec,
            'artwork' => $albumArt,
            'spotifyUrl' => $item['external_urls']['spotify'] ?? '',
            'source' => 'spotify'
        ];
    }

    echo json_encode([
        'success' => true,
        'configured' => true,
        'tracks' => $formatted
    ]);
} else {
    echo json_encode([
        'success' => false,
        'configured' => true,
        'message' => 'Spotify search failed',
        'tracks' => []
    ]);
}

