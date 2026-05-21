<?php
/**
 * WERKUREN API (PHP + MySQL overzicht)
 * 
 * SQL OM TABELLEN AAN TE MAKEN (Copy-paste naar phpMyAdmin SQL tab):
 * 
 * CREATE TABLE IF NOT EXISTS users (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     username VARCHAR(255) UNIQUE NOT NULL,
 *     password_hash VARCHAR(255) NOT NULL,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 * 
 * CREATE TABLE IF NOT EXISTS registrations (
 *     id VARCHAR(255) PRIMARY KEY,
 *     user_id INT NOT NULL,
 *     date DATE NOT NULL,
 *     start TIME NOT NULL,
 *     end TIME NOT NULL,
 *     type VARCHAR(50) NOT NULL DEFAULT 'werk',
 *     description TEXT,
 *     FOREIGN KEY (user_id) REFERENCES users(id)
 * );
 * 
 * CREATE TABLE IF NOT EXISTS base_schedule (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     user_id INT NOT NULL,
 *     day_index INT NOT NULL,
 *     active TINYINT(1) NOT NULL DEFAULT 1,
 *     start TIME NOT NULL DEFAULT '08:00',
 *     end TIME NOT NULL DEFAULT '15:30',
 *     has_break TINYINT(1) NOT NULL DEFAULT 1,
 *     break_start TIME NOT NULL DEFAULT '12:00',
 *     break_end TIME NOT NULL DEFAULT '12:30',
 *     UNIQUE(user_id, day_index),
 *     FOREIGN KEY (user_id) REFERENCES users(id)
 * );
 * 
 * CREATE TABLE IF NOT EXISTS settings (
 *     user_id INT PRIMARY KEY,
 *     overtime_balance FLOAT NOT NULL DEFAULT 0,
 *     employee_start_date VARCHAR(50) DEFAULT '',
 *     country VARCHAR(10) DEFAULT 'BE',
 *     FOREIGN KEY (user_id) REFERENCES users(id)
 * );
 */

// --- CONFIGURATIE (VUL DIT IN NA HET AANMAKEN VAN DE DB OP HOSTINGER) ---
$db_host = 'localhost'; 
$db_name = 'isandybe_werkuren'; // De database naam die je hebt aangemaakt
$db_user = 'isandybe_werkuren';   // De database gebruiker
$db_pass = '4h4%wetN6aHsxs';    // Het database wachtwoord
$jwt_secret = 'een-geheim-wachtwoord-123'; // Verander dit voor extra veiligheid

// --- CORS & HEADERS ---
header("Access-Control-Allow-Origin: *"); 
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --- DATABASE VERBINDING ---
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    die(json_encode(["error" => "Database verbinding mislukt: " . $e->getMessage()]));
}

// --- HELPERS ---
function base64UrlEncode($data) {
    return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($data));
}

function base64UrlDecode($data) {
    return base64_decode(str_replace(['-', '_'], ['+', '/'], $data));
}

function createJWT($userId, $username, $secret) {
    $header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
    $payload = json_encode(['id' => $userId, 'username' => $username, 'exp' => time() + (7 * 24 * 60 * 60)]);
    $h = base64UrlEncode($header);
    $p = base64UrlEncode($payload);
    $signature = hash_hmac('sha256', "$h.$p", $secret, true);
    $s = base64UrlEncode($signature);
    return "$h.$p.$s";
}

function getAuthUser($secret) {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s(\S+)/', $auth, $matches)) {
        $jwt = $matches[1];
        $parts = explode('.', $jwt);
        if (count($parts) === 3) {
            $h = $parts[0]; $p = $parts[1]; $s = $parts[2];
            $signature = hash_hmac('sha256', "$h.$p", $secret, true);
            if (base64UrlEncode($signature) === $s) {
                $payload = json_decode(base64UrlDecode($p), true);
                if ($payload['exp'] > time()) return $payload;
            }
        }
    }
    http_response_code(401);
    die(json_encode(["error" => "Niet geautoriseerd"]));
}

// --- ROUTING ---
$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? '/';
$input = json_decode(file_get_contents('php://input'), true);

// 1. AUTH
if ($path === '/auth/register' && $method === 'POST') {
    $stmt = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
    $stmt->execute([$input['username'], password_hash($input['password'], PASSWORD_DEFAULT)]);
    $userId = $pdo->lastInsertId();
    
    // Default schedule setup
    for ($i = 0; $i < 14; $i++) {
        $isActive = ($i % 7) >= 0 && ($i % 7) <= 3 ? 1 : 0;
        $pdo->prepare("INSERT INTO base_schedule (user_id, day_index, active) VALUES (?, ?, ?)")
            ->execute([$userId, $i, $isActive]);
    }
    $pdo->prepare("INSERT INTO settings (user_id) VALUES (?)")->execute([$userId]);
    
    echo json_encode(["token" => createJWT($userId, $input['username'], $jwt_secret), "user" => ["id" => $userId, "username" => $input['username']]]);
    exit();
}

if ($path === '/auth/login' && $method === 'POST') {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$input['username']]);
    $user = $stmt->fetch();
    if ($user && password_verify($input['password'], $user['password_hash'])) {
        echo json_encode(["token" => createJWT($user['id'], $user['username'], $jwt_secret), "user" => ["id" => $user['id'], "username" => $user['username']]]);
    } else {
        http_response_code(401);
        echo json_encode(["error" => "Ongeldige gegevens"]);
    }
    exit();
}

// 2. DATA (JWT REQUIRED)
$user = getAuthUser($jwt_secret);

if ($path === '/registrations') {
    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT * FROM registrations WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        echo json_encode($stmt->fetchAll());
    } elseif ($method === 'POST') {
        $id = bin2hex(random_bytes(16));
        $stmt = $pdo->prepare("INSERT INTO registrations (id, user_id, date, start, end, type, description) VALUES (?,?,?,?,?,?,?)");
        $stmt->execute([$id, $user['id'], $input['date'], $input['start'], $input['end'], $input['type'], $input['description'] ?? '']);
        echo json_encode(array_merge(["id" => $id], $input));
    }
    exit();
}

if ($path === '/registrations/bulk' && $method === 'POST') {
    foreach ($input as $r) {
        $id = bin2hex(random_bytes(16));
        $pdo->prepare("INSERT INTO registrations (id, user_id, date, start, end, type, description) VALUES (?,?,?,?,?,?,?)")
            ->execute([$id, $user['id'], $r['date'], $r['start'], $r['end'], $r['type'], $r['description'] ?? '']);
    }
    $stmt = $pdo->prepare("SELECT * FROM registrations WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    echo json_encode($stmt->fetchAll());
    exit();
}

if (preg_match('/^\/registrations\/(.+)$/', $path, $m)) {
    $regId = $m[1];
    if ($method === 'PUT') {
        $pdo->prepare("UPDATE registrations SET date=?, start=?, end=?, type=?, description=? WHERE id=? AND user_id=?")
            ->execute([$input['date'], $input['start'], $input['end'], $input['type'], $input['description'] ?? '', $regId, $user['id']]);
        echo json_encode(["ok" => true]);
    } elseif ($method === 'DELETE') {
        $pdo->prepare("DELETE FROM registrations WHERE id=? AND user_id=?")->execute([$regId, $user['id']]);
        echo json_encode(["ok" => true]);
    }
    exit();
}

if ($path === '/base-schedule') {
    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT * FROM base_schedule WHERE user_id = ? ORDER BY day_index");
        $stmt->execute([$user['id']]);
        $rows = $stmt->fetchAll();
        echo json_encode(array_map(function($r) {
            return [
                "active" => (bool)$r['active'], "start" => substr($r['start'], 0, 5), "end" => substr($r['end'], 0, 5),
                "hasBreak" => (bool)$r['has_break'], "breakStart" => substr($r['break_start'], 0, 5), "breakEnd" => substr($r['break_end'], 0, 5)
            ];
        }, $rows));
    }
    exit();
}

if (preg_match('/^\/base-schedule\/(\d+)$/', $path, $m)) {
    $dayIndex = $m[1];
    if ($method === 'PUT') {
        $pdo->prepare("UPDATE base_schedule SET active=?, start=?, end=?, has_break=?, break_start=?, break_end=? WHERE user_id=? AND day_index=?")
            ->execute([(int)$input['active'], $input['start'], $input['end'], (int)$input['hasBreak'], $input['breakStart'], $input['breakEnd'], $user['id'], $dayIndex]);
        echo json_encode(["ok" => true]);
    }
    exit();
}

if ($path === '/settings') {
    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT * FROM settings WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        $r = $stmt->fetch();
        echo json_encode([
            "overtimeBalance" => $r['overtime_balance'] ?? 0, 
            "employeeStartDate" => $r['employee_start_date'] ?? '',
            "country" => $r['country'] ?? 'BE'
        ]);
    } elseif ($method === 'PUT') {
        $pdo->prepare("UPDATE settings SET overtime_balance=?, employee_start_date=?, country=? WHERE user_id=?")
            ->execute([$input['overtimeBalance'], $input['employeeStartDate'], $input['country'] ?? 'BE', $user['id']]);
        echo json_encode(["ok" => true]);
    }
    exit();
}
