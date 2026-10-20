<?php
/**
 * WERKUREN API (PHP + MySQL)
 *
 * De databank wordt automatisch aangemaakt en bijgewerkt (zie migrate()).
 * Je hoeft dus geen SQL meer uit te voeren in phpMyAdmin.
 *
 * Gevoelige gegevens (databank-wachtwoord, JWT-geheim) kun je op de server in een
 * apart bestand "config.php" naast api.php zetten. Dat bestand zit niet in git en
 * wordt bij een deploy niet overschreven. Voorbeeld:
 *
 *   <?php
 *   $db_host = 'localhost';
 *   $db_name = 'isandybe_werkuren';
 *   $db_user = 'isandybe_werkuren';
 *   $db_pass = '...';
 *   $jwt_secret = '...';
 *
 * Externe koppelingen:
 *   - Webhooks per entiteit (Admin > Integraties): realtime, bij indienen of bij goedkeuring.
 *   - Export-API: GET api.php/export?key=API_SLEUTEL&from=2026-10-01&to=2026-10-31[&status=approved]
 */

// --- CONFIGURATIE ---
$db_host = 'localhost';
$db_name = 'isandybe_werkuren';
$db_user = 'isandybe_werkuren';
$db_pass = '4h4%wetN6aHsxs';
$jwt_secret = 'een-geheim-wachtwoord-123';
if (file_exists(__DIR__ . '/config.php')) {
    require __DIR__ . '/config.php';
}

const SCHEMA_VERSION = 4;
const MAX_ROTATION_WEEKS = 4;
// Types waarvoor nooit een project gevraagd wordt
const NON_PROJECT_TYPES = ['pauze', 'ziekte', 'verlof', 'feestdag', 'afwezig'];

// --- CORS & HEADERS ---
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --- HELPERS ---
function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit();
}

function fail($message, $code = 400) {
    out(["error" => $message], $code);
}

function intOrNull($v) {
    return ($v === null || $v === '' || $v === false) ? null : (int)$v;
}

function validDate($d) {
    return is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d);
}

// --- DATABASE ---
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    // Echte prepared statements: getallen komen als getal terug (niet als tekst)
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);
} catch (PDOException $e) {
    fail("Database verbinding mislukt: " . $e->getMessage(), 500);
}

function migrate($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_meta (k VARCHAR(50) PRIMARY KEY, v VARCHAR(255))");
    $version = (int)($pdo->query("SELECT v FROM app_meta WHERE k = 'schema_version'")->fetchColumn() ?: 0);
    if ($version >= SCHEMA_VERSION) return;

    $createSql = "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'user',
            entity_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS companies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS entities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS entity_settings (
            entity_id INT PRIMARY KEY,
            time_step INT DEFAULT 30,
            allow_deviate_time_step TINYINT(1) DEFAULT 0,
            schedule_rotation_weeks INT DEFAULT 2,
            approval_required VARCHAR(50) DEFAULT 'none',
            custom_registration_types TEXT,
            auto_split_overtime TINYINT(1) DEFAULT 0,
            allow_manual_split_overtime TINYINT(1) DEFAULT 1,
            project_mode VARCHAR(20) DEFAULT 'off',
            lock_default_project TINYINT(1) DEFAULT 0,
            webhook_url VARCHAR(500) DEFAULT '',
            webhook_secret VARCHAR(255) DEFAULT '',
            webhook_mode VARCHAR(20) DEFAULT 'off',
            api_key VARCHAR(64) DEFAULT NULL
        );
        CREATE TABLE IF NOT EXISTS user_entities (
            user_id INT NOT NULL,
            entity_id INT NOT NULL,
            default_project_id INT,
            default_subject_id INT,
            PRIMARY KEY (user_id, entity_id)
        );
        CREATE TABLE IF NOT EXISTS projects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entity_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            is_active TINYINT(1) DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS subjects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            is_active TINYINT(1) DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS registrations (
            id VARCHAR(255) PRIMARY KEY,
            user_id INT NOT NULL,
            entity_id INT,
            date DATE NOT NULL,
            start TIME NOT NULL,
            end TIME NOT NULL,
            type VARCHAR(50) NOT NULL DEFAULT 'werk',
            description TEXT,
            project_id INT,
            subject_id INT,
            status VARCHAR(50) DEFAULT 'draft'
        );
        CREATE TABLE IF NOT EXISTS base_schedule (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            day_index INT NOT NULL,
            active TINYINT(1) NOT NULL DEFAULT 1,
            start TIME NOT NULL DEFAULT '08:00',
            end TIME NOT NULL DEFAULT '15:30',
            has_break TINYINT(1) NOT NULL DEFAULT 1,
            break_start TIME NOT NULL DEFAULT '12:00',
            break_end TIME NOT NULL DEFAULT '12:30',
            UNIQUE(user_id, day_index)
        );
        CREATE TABLE IF NOT EXISTS settings (
            user_id INT PRIMARY KEY,
            overtime_balance FLOAT NOT NULL DEFAULT 0,
            employee_start_date VARCHAR(50) DEFAULT '',
            country VARCHAR(10) DEFAULT 'BE',
            time_step INT DEFAULT 30,
            default_project_id INT,
            default_subject_id INT,
            schedule_rotation_weeks INT DEFAULT NULL,
            rotation_start_date VARCHAR(20) DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            entity_id INT NOT NULL,
            period_type VARCHAR(20) NOT NULL,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'submitted',
            comment TEXT,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            decided_at DATETIME NULL,
            decided_by INT NULL
        );
        CREATE TABLE IF NOT EXISTS webhook_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entity_id INT NOT NULL,
            event VARCHAR(50) NOT NULL,
            status_code INT,
            error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ";
    foreach (array_filter(array_map('trim', explode(';', $createSql))) as $sql) {
        $pdo->exec($sql);
    }

    // Kolommen voor oudere installaties (fouten = kolom bestaat al)
    $alters = [
        "ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN entity_id INT",
        "ALTER TABLE registrations ADD COLUMN entity_id INT",
        "ALTER TABLE registrations ADD COLUMN project_id INT",
        "ALTER TABLE registrations ADD COLUMN subject_id INT",
        "ALTER TABLE registrations ADD COLUMN status VARCHAR(50) DEFAULT 'draft'",
        "ALTER TABLE settings ADD COLUMN time_step INT DEFAULT 30",
        "ALTER TABLE settings ADD COLUMN default_project_id INT",
        "ALTER TABLE settings ADD COLUMN default_subject_id INT",
        "ALTER TABLE settings ADD COLUMN schedule_rotation_weeks INT DEFAULT NULL",
        "ALTER TABLE settings ADD COLUMN rotation_start_date VARCHAR(20) DEFAULT ''",
        "ALTER TABLE entity_settings ADD COLUMN custom_registration_types TEXT",
        "ALTER TABLE entity_settings ADD COLUMN auto_split_overtime TINYINT(1) DEFAULT 0",
        "ALTER TABLE entity_settings ADD COLUMN allow_manual_split_overtime TINYINT(1) DEFAULT 1",
        "ALTER TABLE entity_settings ADD COLUMN project_mode VARCHAR(20) DEFAULT 'off'",
        "ALTER TABLE entity_settings ADD COLUMN lock_default_project TINYINT(1) DEFAULT 0",
        "ALTER TABLE entity_settings ADD COLUMN webhook_url VARCHAR(500) DEFAULT ''",
        "ALTER TABLE entity_settings ADD COLUMN webhook_secret VARCHAR(255) DEFAULT ''",
        "ALTER TABLE entity_settings ADD COLUMN webhook_mode VARCHAR(20) DEFAULT 'off'",
        "ALTER TABLE entity_settings ADD COLUMN api_key VARCHAR(64) DEFAULT NULL",
    ];
    foreach ($alters as $sql) {
        try { $pdo->exec($sql); } catch (Exception $e) {}
    }

    // Data-migraties
    $pdo->exec("INSERT IGNORE INTO user_entities (user_id, entity_id, default_project_id, default_subject_id)
                SELECT u.id, u.entity_id, s.default_project_id, s.default_subject_id
                FROM users u LEFT JOIN settings s ON s.user_id = u.id WHERE u.entity_id IS NOT NULL");
    $pdo->exec("UPDATE registrations r JOIN users u ON u.id = r.user_id SET r.entity_id = u.entity_id WHERE r.entity_id IS NULL AND u.entity_id IS NOT NULL");
    $pdo->exec("UPDATE registrations SET status = 'draft' WHERE status IS NULL OR status = ''");

    $pdo->prepare("REPLACE INTO app_meta (k, v) VALUES ('schema_version', ?)")->execute([SCHEMA_VERSION]);
}

try {
    migrate($pdo);
} catch (Exception $e) {
    fail("Databank bijwerken mislukt: " . $e->getMessage(), 500);
}

// --- JWT ---
function base64UrlEncode($data) {
    return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($data));
}

function base64UrlDecode($data) {
    return base64_decode(str_replace(['-', '_'], ['+', '/'], $data));
}

function createJWT($userId, $username, $secret) {
    $h = base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $p = base64UrlEncode(json_encode(['id' => (int)$userId, 'username' => $username, 'exp' => time() + (7 * 24 * 60 * 60)]));
    $s = base64UrlEncode(hash_hmac('sha256', "$h.$p", $secret, true));
    return "$h.$p.$s";
}

function getBearer() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization']
        ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    return preg_match('/Bearer\s(\S+)/', $auth, $m) ? $m[1] : null;
}

// Geeft de ingelogde gebruiker terug, altijd met de actuele rol uit de databank.
function getAuthUser($pdo, $secret) {
    $jwt = getBearer();
    if ($jwt) {
        $parts = explode('.', $jwt);
        if (count($parts) === 3) {
            [$h, $p, $s] = $parts;
            if (hash_equals(base64UrlEncode(hash_hmac('sha256', "$h.$p", $secret, true)), $s)) {
                $payload = json_decode(base64UrlDecode($p), true);
                if (($payload['exp'] ?? 0) > time()) {
                    $stmt = $pdo->prepare("SELECT id, username, role, entity_id FROM users WHERE id = ?");
                    $stmt->execute([$payload['id']]);
                    $u = $stmt->fetch();
                    if ($u) {
                        $u['id'] = (int)$u['id'];
                        $u['entity_id'] = intOrNull($u['entity_id']);
                        $u['role'] = $u['role'] ?: 'user';
                        return $u;
                    }
                }
            }
        }
    }
    fail("Niet geautoriseerd", 401);
}

// --- DOMEIN-HELPERS ---
function setupNewUser($pdo, $userId) {
    for ($i = 0; $i < MAX_ROTATION_WEEKS * 7; $i++) {
        $isActive = ($i % 7) <= 3 ? 1 : 0;
        $pdo->prepare("INSERT IGNORE INTO base_schedule (user_id, day_index, active) VALUES (?, ?, ?)")
            ->execute([$userId, $i, $isActive]);
    }
    $pdo->prepare("INSERT IGNORE INTO settings (user_id) VALUES (?)")->execute([$userId]);
}

function userEntityIds($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT entity_id FROM user_entities WHERE user_id = ?");
    $stmt->execute([$userId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function getEntitySettings($pdo, $entityId) {
    $stmt = $pdo->prepare("SELECT * FROM entity_settings WHERE entity_id = ?");
    $stmt->execute([$entityId]);
    $s = $stmt->fetch();
    if (!$s) {
        $pdo->prepare("INSERT IGNORE INTO entity_settings (entity_id) VALUES (?)")->execute([$entityId]);
        $stmt->execute([$entityId]);
        $s = $stmt->fetch();
    }
    return $s;
}

function publicEntitySettings($s) {
    return [
        "timeStep" => (int)($s['time_step'] ?? 30),
        "allowDeviateTimeStep" => (bool)($s['allow_deviate_time_step'] ?? false),
        "scheduleRotationWeeks" => (int)($s['schedule_rotation_weeks'] ?? 2),
        "approvalRequired" => $s['approval_required'] ?: 'none',
        "customRegistrationTypes" => $s['custom_registration_types'] ?: 'Werk,Pauze,Ziekte,Verlof',
        "autoSplitOvertime" => (bool)($s['auto_split_overtime'] ?? false),
        "allowManualSplitOvertime" => isset($s['allow_manual_split_overtime']) ? (bool)$s['allow_manual_split_overtime'] : true,
        "projectMode" => $s['project_mode'] ?: 'off',
        "lockDefaultProject" => (bool)($s['lock_default_project'] ?? false),
    ];
}

function canManageEntity($pdo, $user, $entityId) {
    if (!$entityId) return false;
    if ($user['role'] === 'super_admin') return true;
    if ($user['role'] !== 'entity_admin') return false;
    return in_array((int)$entityId, userEntityIds($pdo, $user['id']), true);
}

function requireManage($pdo, $user, $entityId) {
    if (!canManageEntity($pdo, $user, $entityId)) fail("Geen beheerrechten voor deze entiteit", 403);
}

function projectEntity($pdo, $projectId) {
    $stmt = $pdo->prepare("SELECT entity_id FROM projects WHERE id = ?");
    $stmt->execute([$projectId]);
    $v = $stmt->fetchColumn();
    return $v === false ? null : (int)$v;
}

function subjectProject($pdo, $subjectId) {
    $stmt = $pdo->prepare("SELECT project_id FROM subjects WHERE id = ?");
    $stmt->execute([$subjectId]);
    $v = $stmt->fetchColumn();
    return $v === false ? null : (int)$v;
}

function formatReg($r) {
    $r['start'] = substr($r['start'], 0, 5);
    $r['end'] = substr($r['end'], 0, 5);
    foreach (['user_id', 'entity_id', 'project_id', 'subject_id'] as $k) {
        if (array_key_exists($k, $r)) $r[$k] = intOrNull($r[$k]);
    }
    $r['status'] = $r['status'] ?: 'draft';
    return $r;
}

function fetchRegs($pdo, $where, $params) {
    $stmt = $pdo->prepare("SELECT r.*, p.name AS project_name, s.name AS subject_name, u.username
        FROM registrations r
        LEFT JOIN projects p ON p.id = r.project_id
        LEFT JOIN subjects s ON s.id = r.subject_id
        LEFT JOIN users u ON u.id = r.user_id
        WHERE $where ORDER BY r.date, r.start");
    $stmt->execute($params);
    return array_map('formatReg', $stmt->fetchAll());
}

function isDateLocked($pdo, $userId, $entityId, $date) {
    if (!$entityId) return false;
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM submissions WHERE user_id = ? AND entity_id = ? AND status IN ('submitted','approved') AND ? BETWEEN period_start AND period_end");
    $stmt->execute([$userId, $entityId, $date]);
    return $stmt->fetchColumn() > 0;
}

// Controleert en vult een registratie aan volgens de instellingen van de entiteit.
function prepareRegistration($pdo, $user, $input) {
    $date = $input['date'] ?? null;
    $start = substr((string)($input['start'] ?? ''), 0, 5);
    $end = substr((string)($input['end'] ?? ''), 0, 5);
    if (!validDate($date) || !preg_match('/^\d{2}:\d{2}$/', $start) || !preg_match('/^\d{2}:\d{2}$/', $end)) {
        fail("Ongeldige datum of tijd");
    }
    if ($end <= $start) fail("Het tot-uur moet later zijn dan het van-uur");

    $linked = userEntityIds($pdo, $user['id']);
    $entityId = intOrNull($input['entity_id'] ?? null);
    if (!$entityId || !in_array($entityId, $linked, true)) {
        $entityId = $user['entity_id'] && in_array($user['entity_id'], $linked, true) ? $user['entity_id'] : ($linked[0] ?? null);
    }

    $type = trim((string)($input['type'] ?? 'werk')) ?: 'werk';
    $projectId = intOrNull($input['project_id'] ?? null);
    $subjectId = intOrNull($input['subject_id'] ?? null);

    if ($entityId) {
        $settings = getEntitySettings($pdo, $entityId);
        $mode = $settings['project_mode'] ?: 'off';
        $needsProject = !in_array(strtolower($type), NON_PROJECT_TYPES, true);

        if ($mode === 'off' || !$needsProject) {
            $projectId = null;
            $subjectId = null;
        } else {
            if ($settings['lock_default_project']) {
                $stmt = $pdo->prepare("SELECT default_project_id, default_subject_id FROM user_entities WHERE user_id = ? AND entity_id = ?");
                $stmt->execute([$user['id'], $entityId]);
                $def = $stmt->fetch();
                if ($def && $def['default_project_id']) {
                    $projectId = (int)$def['default_project_id'];
                    $subjectId = intOrNull($def['default_subject_id']);
                }
            }
            if ($projectId && projectEntity($pdo, $projectId) !== $entityId) fail("Dit project hoort niet bij de gekozen entiteit");
            if ($subjectId && subjectProject($pdo, $subjectId) !== $projectId) $subjectId = null;
            if ($mode === 'required' && !$projectId) fail("Kies een project voor deze registratie");
        }
    } else {
        $projectId = null;
        $subjectId = null;
    }

    if (isDateLocked($pdo, $user['id'], $entityId, $date)) {
        fail("Deze periode is al ingediend of goedgekeurd en kan niet meer gewijzigd worden", 409);
    }

    return [
        'date' => $date, 'start' => $start, 'end' => $end, 'type' => $type,
        'description' => (string)($input['description'] ?? ''),
        'entity_id' => $entityId, 'project_id' => $projectId, 'subject_id' => $subjectId,
    ];
}

function insertRegistration($pdo, $userId, $r) {
    $id = bin2hex(random_bytes(16));
    $pdo->prepare("INSERT INTO registrations (id, user_id, entity_id, date, start, end, type, description, project_id, subject_id, status) VALUES (?,?,?,?,?,?,?,?,?,?, 'draft')")
        ->execute([$id, $userId, $r['entity_id'], $r['date'], $r['start'], $r['end'], $r['type'], $r['description'], $r['project_id'], $r['subject_id']]);
    return $id;
}

// --- WEBHOOKS ---
function regPayload($rows) {
    return array_map(function ($r) {
        [$sh, $sm] = array_map('intval', explode(':', $r['start']));
        [$eh, $em] = array_map('intval', explode(':', $r['end']));
        return [
            "id" => $r['id'],
            "user" => ["id" => $r['user_id'], "username" => $r['username'] ?? null],
            "date" => $r['date'],
            "start" => $r['start'],
            "end" => $r['end'],
            "minutes" => ($eh * 60 + $em) - ($sh * 60 + $sm),
            "type" => $r['type'],
            "description" => $r['description'],
            "project" => $r['project_id'] ? ["id" => $r['project_id'], "name" => $r['project_name'] ?? null] : null,
            "subject" => $r['subject_id'] ? ["id" => $r['subject_id'], "name" => $r['subject_name'] ?? null] : null,
            "status" => $r['status'],
        ];
    }, $rows);
}

function sendWebhook($pdo, $entityId, $event, $data, $force = false) {
    if (!$entityId) return null;
    $s = getEntitySettings($pdo, $entityId);
    $url = trim($s['webhook_url'] ?? '');
    if (!$url || (!$force && ($s['webhook_mode'] ?? 'off') === 'off')) return null;

    $stmt = $pdo->prepare("SELECT e.id, e.name, c.name AS company FROM entities e LEFT JOIN companies c ON c.id = e.company_id WHERE e.id = ?");
    $stmt->execute([$entityId]);
    $entity = $stmt->fetch() ?: ["id" => $entityId];

    $body = json_encode(array_merge([
        "event" => $event,
        "sent_at" => date('c'),
        "entity" => $entity,
    ], $data));

    $headers = ["Content-Type: application/json", "X-Werkuren-Event: $event"];
    if (!empty($s['webhook_secret'])) {
        $headers[] = "X-Werkuren-Signature: sha256=" . hash_hmac('sha256', $body, $s['webhook_secret']);
    }

    $code = null;
    $error = null;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 5,
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: null;
        if (curl_errno($ch)) $error = curl_error($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(["http" => ["method" => "POST", "header" => implode("\r\n", $headers), "content" => $body, "timeout" => 5, "ignore_errors" => true]]);
        $res = @file_get_contents($url, false, $ctx);
        if ($res === false) $error = "Verzenden mislukt";
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
    }
    if (!$error && $code && $code >= 400) $error = "HTTP $code";

    $pdo->prepare("INSERT INTO webhook_log (entity_id, event, status_code, error) VALUES (?, ?, ?, ?)")
        ->execute([$entityId, $event, $code, $error]);
    return ["status_code" => $code, "error" => $error];
}

function webhookMode($pdo, $entityId) {
    if (!$entityId) return 'off';
    $s = getEntitySettings($pdo, $entityId);
    return trim($s['webhook_url'] ?? '') ? ($s['webhook_mode'] ?: 'off') : 'off';
}

function realtimeWebhook($pdo, $entityId, $event, $rows) {
    if (webhookMode($pdo, $entityId) === 'realtime') {
        sendWebhook($pdo, $entityId, $event, ["registrations" => regPayload($rows)]);
    }
}

function submissionRegs($pdo, $sub) {
    return fetchRegs($pdo, "r.user_id = ? AND r.entity_id = ? AND r.date BETWEEN ? AND ?",
        [$sub['user_id'], $sub['entity_id'], $sub['period_start'], $sub['period_end']]);
}

function submissionWebhook($pdo, $sub, $event) {
    $mode = webhookMode($pdo, $sub['entity_id']);
    if (($event === 'submission.submitted' && $mode === 'on_submit') || ($event === 'submission.approved' && $mode === 'on_approval')) {
        sendWebhook($pdo, $sub['entity_id'], $event, [
            "submission" => [
                "id" => (int)$sub['id'], "user_id" => (int)$sub['user_id'], "period_type" => $sub['period_type'],
                "period_start" => $sub['period_start'], "period_end" => $sub['period_end'], "status" => $sub['status'],
            ],
            "registrations" => regPayload(submissionRegs($pdo, $sub)),
        ]);
    }
}

function getSubmission($pdo, $id) {
    $stmt = $pdo->prepare("SELECT * FROM submissions WHERE id = ?");
    $stmt->execute([$id]);
    return $stmt->fetch();
}

// --- ROUTING ---
$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? '/';
$input = json_decode(file_get_contents('php://input'), true) ?: [];

// 1. AUTH (publiek)
if ($path === '/auth/register' && $method === 'POST') {
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';
    if ($username === '' || strlen($password) < 4) fail("Gebruikersnaam en wachtwoord (min. 4 tekens) zijn verplicht");
    $hasSuper = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'")->fetchColumn() > 0;
    $role = $hasSuper ? 'user' : 'super_admin';
    try {
        $pdo->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
            ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role]);
    } catch (PDOException $e) {
        fail("Deze gebruikersnaam bestaat al");
    }
    $userId = (int)$pdo->lastInsertId();
    setupNewUser($pdo, $userId);
    out(["token" => createJWT($userId, $username, $jwt_secret), "user" => ["id" => $userId, "username" => $username, "role" => $role, "entity_id" => null]]);
}

if ($path === '/auth/login' && $method === 'POST') {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$input['username'] ?? '']);
    $u = $stmt->fetch();
    if ($u && password_verify($input['password'] ?? '', $u['password_hash'])) {
        out(["token" => createJWT($u['id'], $u['username'], $jwt_secret), "user" => ["id" => (int)$u['id'], "username" => $u['username'], "role" => $u['role'] ?: 'user', "entity_id" => intOrNull($u['entity_id'])]]);
    }
    fail("Ongeldige gegevens", 401);
}

// 1b. EXPORT-API (met API-sleutel van de entiteit)
if ($path === '/export' && $method === 'GET') {
    $key = $_GET['key'] ?? (getBearer() ?? '');
    if (strlen($key) < 20) fail("API-sleutel ontbreekt", 401);
    $stmt = $pdo->prepare("SELECT entity_id FROM entity_settings WHERE api_key = ?");
    $stmt->execute([$key]);
    $entityId = $stmt->fetchColumn();
    if (!$entityId) fail("Ongeldige API-sleutel", 401);
    $from = validDate($_GET['from'] ?? '') ? $_GET['from'] : date('Y-m-01');
    $to = validDate($_GET['to'] ?? '') ? $_GET['to'] : date('Y-m-t');
    $where = "r.entity_id = ? AND r.date BETWEEN ? AND ?";
    $params = [$entityId, $from, $to];
    if (!empty($_GET['status'])) {
        $where .= " AND r.status = ?";
        $params[] = $_GET['status'];
    }
    out(["entity_id" => (int)$entityId, "from" => $from, "to" => $to, "registrations" => regPayload(fetchRegs($pdo, $where, $params))]);
}

// 2. DATA (JWT vereist)
$user = getAuthUser($pdo, $jwt_secret);
$isSuperAdmin = $user['role'] === 'super_admin';
$isAdmin = $isSuperAdmin || $user['role'] === 'entity_admin';

if ($path === '/me' && $method === 'GET') {
    $stmt = $pdo->prepare("SELECT e.id, e.name, c.name AS company_name, ue.default_project_id, ue.default_subject_id
        FROM user_entities ue JOIN entities e ON e.id = ue.entity_id LEFT JOIN companies c ON c.id = e.company_id
        WHERE ue.user_id = ? ORDER BY c.name, e.name");
    $stmt->execute([$user['id']]);
    $entities = [];
    foreach ($stmt->fetchAll() as $e) {
        $pstmt = $pdo->prepare("SELECT id, name FROM projects WHERE entity_id = ? AND is_active = 1 ORDER BY name");
        $pstmt->execute([$e['id']]);
        $projects = [];
        foreach ($pstmt->fetchAll() as $p) {
            $sstmt = $pdo->prepare("SELECT id, name FROM subjects WHERE project_id = ? AND is_active = 1 ORDER BY name");
            $sstmt->execute([$p['id']]);
            $projects[] = [
                "id" => (int)$p['id'], "name" => $p['name'],
                "subjects" => array_map(fn($s) => ["id" => (int)$s['id'], "name" => $s['name']], $sstmt->fetchAll()),
            ];
        }
        $entities[] = [
            "id" => (int)$e['id'],
            "name" => $e['name'],
            "companyName" => $e['company_name'],
            "defaultProjectId" => intOrNull($e['default_project_id']),
            "defaultSubjectId" => intOrNull($e['default_subject_id']),
            "settings" => publicEntitySettings(getEntitySettings($pdo, $e['id'])),
            "projects" => $projects,
        ];
    }
    out(["user" => $user, "entities" => $entities]);
}

if ($path === '/registrations') {
    if ($method === 'GET') {
        out(fetchRegs($pdo, "r.user_id = ?", [$user['id']]));
    }
    if ($method === 'POST') {
        $r = prepareRegistration($pdo, $user, $input);
        $id = insertRegistration($pdo, $user['id'], $r);
        $rows = fetchRegs($pdo, "r.id = ?", [$id]);
        realtimeWebhook($pdo, $r['entity_id'], 'registration.created', $rows);
        out($rows[0]);
    }
}

if ($path === '/registrations/bulk' && $method === 'POST') {
    $prepared = [];
    foreach ((is_array($input) ? $input : []) as $item) {
        $prepared[] = prepareRegistration($pdo, $user, $item);
    }
    $ids = [];
    $pdo->beginTransaction();
    foreach ($prepared as $r) $ids[] = insertRegistration($pdo, $user['id'], $r);
    $pdo->commit();
    if ($ids) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $created = fetchRegs($pdo, "r.id IN ($placeholders)", $ids);
        $byEntity = [];
        foreach ($created as $c) $byEntity[$c['entity_id'] ?? 0][] = $c;
        foreach ($byEntity as $eid => $rows) realtimeWebhook($pdo, $eid, 'registration.created', $rows);
    }
    out(fetchRegs($pdo, "r.user_id = ?", [$user['id']]));
}

if (preg_match('/^\/registrations\/([a-f0-9]+)$/', $path, $m)) {
    $existing = fetchRegs($pdo, "r.id = ? AND r.user_id = ?", [$m[1], $user['id']]);
    if (!$existing) fail("Registratie niet gevonden", 404);
    $old = $existing[0];
    if (in_array($old['status'], ['submitted', 'approved'], true) || isDateLocked($pdo, $user['id'], $old['entity_id'], $old['date'])) {
        fail("Deze registratie is al ingediend of goedgekeurd en kan niet meer gewijzigd worden", 409);
    }
    if ($method === 'PUT') {
        $r = prepareRegistration($pdo, $user, array_merge(['entity_id' => $old['entity_id']], $input));
        $pdo->prepare("UPDATE registrations SET entity_id=?, date=?, start=?, end=?, type=?, description=?, project_id=?, subject_id=?, status='draft' WHERE id=? AND user_id=?")
            ->execute([$r['entity_id'], $r['date'], $r['start'], $r['end'], $r['type'], $r['description'], $r['project_id'], $r['subject_id'], $old['id'], $user['id']]);
        $rows = fetchRegs($pdo, "r.id = ?", [$old['id']]);
        realtimeWebhook($pdo, $r['entity_id'], 'registration.updated', $rows);
        out($rows[0]);
    }
    if ($method === 'DELETE') {
        $pdo->prepare("DELETE FROM registrations WHERE id=? AND user_id=?")->execute([$old['id'], $user['id']]);
        realtimeWebhook($pdo, $old['entity_id'], 'registration.deleted', [$old]);
        out(["ok" => true]);
    }
}

if ($path === '/base-schedule' && $method === 'GET') {
    // Zorg voor 4 weken; nieuwe weken nemen week 1 over
    $stmt = $pdo->prepare("SELECT * FROM base_schedule WHERE user_id = ? ORDER BY day_index");
    $stmt->execute([$user['id']]);
    $rows = [];
    foreach ($stmt->fetchAll() as $r) $rows[(int)$r['day_index']] = $r;
    for ($i = 0; $i < MAX_ROTATION_WEEKS * 7; $i++) {
        if (isset($rows[$i])) continue;
        $src = $rows[$i % 7] ?? ['active' => ($i % 7) <= 3 ? 1 : 0, 'start' => '08:00', 'end' => '15:30', 'has_break' => 1, 'break_start' => '12:00', 'break_end' => '12:30'];
        $pdo->prepare("INSERT IGNORE INTO base_schedule (user_id, day_index, active, start, end, has_break, break_start, break_end) VALUES (?,?,?,?,?,?,?,?)")
            ->execute([$user['id'], $i, $src['active'], $src['start'], $src['end'], $src['has_break'], $src['break_start'], $src['break_end']]);
        $rows[$i] = $src;
    }
    ksort($rows);
    out(array_values(array_map(function ($r) {
        return [
            "active" => (bool)$r['active'], "start" => substr($r['start'], 0, 5), "end" => substr($r['end'], 0, 5),
            "hasBreak" => (bool)$r['has_break'], "breakStart" => substr($r['break_start'], 0, 5), "breakEnd" => substr($r['break_end'], 0, 5),
        ];
    }, $rows)));
}

if (preg_match('/^\/base-schedule\/(\d+)$/', $path, $m) && $method === 'PUT') {
    $dayIndex = (int)$m[1];
    if ($dayIndex >= MAX_ROTATION_WEEKS * 7) fail("Ongeldige dag");
    $pdo->prepare("INSERT IGNORE INTO base_schedule (user_id, day_index) VALUES (?, ?)")->execute([$user['id'], $dayIndex]);
    $pdo->prepare("UPDATE base_schedule SET active=?, start=?, end=?, has_break=?, break_start=?, break_end=? WHERE user_id=? AND day_index=?")
        ->execute([(int)!empty($input['active']), $input['start'], $input['end'], (int)!empty($input['hasBreak']), $input['breakStart'] ?: '12:00', $input['breakEnd'] ?: '12:30', $user['id'], $dayIndex]);
    out(["ok" => true]);
}

if ($path === '/settings') {
    if ($method === 'GET') {
        $pdo->prepare("INSERT IGNORE INTO settings (user_id) VALUES (?)")->execute([$user['id']]);
        $stmt = $pdo->prepare("SELECT * FROM settings WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        $r = $stmt->fetch() ?: [];
        $entitySettings = $user['entity_id'] ? publicEntitySettings(getEntitySettings($pdo, $user['entity_id'])) : null;
        $userRotation = intOrNull($r['schedule_rotation_weeks'] ?? null);
        out([
            "overtimeBalance" => (float)($r['overtime_balance'] ?? 0),
            "employeeStartDate" => $r['employee_start_date'] ?? '',
            "country" => $r['country'] ?? 'BE',
            "timeStep" => (int)($r['time_step'] ?? 30),
            "userRotationWeeks" => $userRotation,
            "rotationStartDate" => $r['rotation_start_date'] ?? '',
            "scheduleRotationWeeks" => $userRotation ?: ($entitySettings['scheduleRotationWeeks'] ?? 2),
        ]);
    }
    if ($method === 'PUT') {
        $map = [
            'overtimeBalance' => 'overtime_balance',
            'employeeStartDate' => 'employee_start_date',
            'country' => 'country',
            'timeStep' => 'time_step',
        ];
        // Rotatie mag de gebruiker zelf enkel kiezen als hij niet aan een entiteit gekoppeld is
        if ($isAdmin || !userEntityIds($pdo, $user['id'])) {
            $map['userRotationWeeks'] = 'schedule_rotation_weeks';
            $map['rotationStartDate'] = 'rotation_start_date';
        }
        $sets = [];
        $params = [];
        foreach ($map as $key => $col) {
            if (!array_key_exists($key, $input)) continue;
            $val = $input[$key];
            if ($key === 'userRotationWeeks') $val = $val ? max(1, min(MAX_ROTATION_WEEKS, (int)$val)) : null;
            if ($key === 'overtimeBalance') $val = (float)$val;
            if ($key === 'timeStep') $val = (int)$val ?: 30;
            $sets[] = "$col = ?";
            $params[] = $val;
        }
        $pdo->prepare("INSERT IGNORE INTO settings (user_id) VALUES (?)")->execute([$user['id']]);
        if ($sets) {
            $params[] = $user['id'];
            $pdo->prepare("UPDATE settings SET " . implode(', ', $sets) . " WHERE user_id = ?")->execute($params);
        }
        out(["ok" => true]);
    }
}

// 2b. INDIENEN / GOEDKEURING (gebruiker)
if ($path === '/submissions') {
    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT * FROM submissions WHERE user_id = ? ORDER BY period_start DESC");
        $stmt->execute([$user['id']]);
        out(array_map(function ($s) {
            foreach (['id', 'user_id', 'entity_id', 'decided_by'] as $k) $s[$k] = intOrNull($s[$k]);
            return $s;
        }, $stmt->fetchAll()));
    }
    if ($method === 'POST') {
        $entityId = intOrNull($input['entity_id'] ?? null);
        if (!$entityId || !in_array($entityId, userEntityIds($pdo, $user['id']), true)) fail("Kies een entiteit");
        $settings = getEntitySettings($pdo, $entityId);
        if (($settings['approval_required'] ?: 'none') === 'none') fail("Voor deze entiteit is indienen niet nodig");
        $type = $input['period_type'] ?? '';
        $start = $input['period_start'] ?? '';
        $end = $input['period_end'] ?? '';
        if (!in_array($type, ['day', 'week', 'workweek'], true) || !validDate($start) || !validDate($end) || $end < $start) fail("Ongeldige periode");

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM submissions WHERE user_id = ? AND entity_id = ? AND status IN ('submitted','approved') AND period_start <= ? AND period_end >= ?");
        $stmt->execute([$user['id'], $entityId, $end, $start]);
        if ($stmt->fetchColumn() > 0) fail("Deze periode is al (deels) ingediend", 409);

        $pdo->prepare("DELETE FROM submissions WHERE user_id = ? AND entity_id = ? AND status = 'rejected' AND period_start <= ? AND period_end >= ?")
            ->execute([$user['id'], $entityId, $end, $start]);
        $pdo->prepare("INSERT INTO submissions (user_id, entity_id, period_type, period_start, period_end, status) VALUES (?,?,?,?,?, 'submitted')")
            ->execute([$user['id'], $entityId, $type, $start, $end]);
        $sub = getSubmission($pdo, $pdo->lastInsertId());
        $pdo->prepare("UPDATE registrations SET status = 'submitted' WHERE user_id = ? AND entity_id = ? AND date BETWEEN ? AND ?")
            ->execute([$user['id'], $entityId, $start, $end]);
        submissionWebhook($pdo, $sub, 'submission.submitted');
        out($sub);
    }
}

if (preg_match('/^\/submissions\/(\d+)$/', $path, $m) && $method === 'DELETE') {
    $sub = getSubmission($pdo, $m[1]);
    if (!$sub || (int)$sub['user_id'] !== $user['id']) fail("Niet gevonden", 404);
    if ($sub['status'] !== 'submitted') fail("Enkel een ingediende (nog niet goedgekeurde) periode kan ingetrokken worden", 409);
    $pdo->prepare("UPDATE registrations SET status = 'draft' WHERE user_id = ? AND entity_id = ? AND date BETWEEN ? AND ?")
        ->execute([$user['id'], $sub['entity_id'], $sub['period_start'], $sub['period_end']]);
    $pdo->prepare("DELETE FROM submissions WHERE id = ?")->execute([$sub['id']]);
    out(["ok" => true]);
}

// 3. ADMIN & MULTI-TENANCY
if (strpos($path, '/admin/') === 0) {
    if (!$isAdmin) fail("Admin rechten vereist", 403);
    $qEntity = intOrNull($_GET['entity_id'] ?? ($input['entity_id'] ?? null));

    if ($path === '/admin/companies') {
        if (!$isSuperAdmin) fail("Enkel voor super admins", 403);
        if ($method === 'GET') out($pdo->query("SELECT * FROM companies ORDER BY name")->fetchAll());
        if ($method === 'POST') {
            $name = trim($input['name'] ?? '');
            if ($name === '') fail("Naam is verplicht");
            $pdo->prepare("INSERT INTO companies (name) VALUES (?)")->execute([$name]);
            out(["id" => (int)$pdo->lastInsertId(), "name" => $name]);
        }
    }

    if ($path === '/admin/entities') {
        if ($method === 'GET') {
            if ($isSuperAdmin) {
                out($pdo->query("SELECT e.*, c.name AS company_name FROM entities e LEFT JOIN companies c ON e.company_id = c.id ORDER BY c.name, e.name")->fetchAll());
            }
            $stmt = $pdo->prepare("SELECT e.*, c.name AS company_name FROM entities e LEFT JOIN companies c ON e.company_id = c.id JOIN user_entities ue ON ue.entity_id = e.id WHERE ue.user_id = ? ORDER BY c.name, e.name");
            $stmt->execute([$user['id']]);
            out($stmt->fetchAll());
        }
        if ($method === 'POST') {
            if (!$isSuperAdmin) fail("Enkel voor super admins", 403);
            $name = trim($input['name'] ?? '');
            if ($name === '' || empty($input['company_id'])) fail("Naam en bedrijf zijn verplicht");
            $pdo->prepare("INSERT INTO entities (name, company_id) VALUES (?, ?)")->execute([$name, (int)$input['company_id']]);
            $id = (int)$pdo->lastInsertId();
            getEntitySettings($pdo, $id);
            out(["id" => $id, "name" => $name, "company_id" => (int)$input['company_id']]);
        }
    }

    if ($path === '/admin/users') {
        if ($method === 'GET') {
            if ($qEntity) {
                requireManage($pdo, $user, $qEntity);
                $stmt = $pdo->prepare("SELECT u.id, u.username, u.role, u.entity_id, u.created_at, ue.default_project_id, ue.default_subject_id,
                        s.schedule_rotation_weeks, s.rotation_start_date
                    FROM users u JOIN user_entities ue ON ue.user_id = u.id AND ue.entity_id = ?
                    LEFT JOIN settings s ON s.user_id = u.id ORDER BY u.username");
                $stmt->execute([$qEntity]);
            } elseif ($isSuperAdmin) {
                $stmt = $pdo->query("SELECT u.id, u.username, u.role, u.entity_id, u.created_at, NULL AS default_project_id, NULL AS default_subject_id,
                        s.schedule_rotation_weeks, s.rotation_start_date
                    FROM users u LEFT JOIN settings s ON s.user_id = u.id ORDER BY u.username");
            } else {
                fail("Kies een entiteit");
            }
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                foreach (['id', 'entity_id', 'default_project_id', 'default_subject_id', 'schedule_rotation_weeks'] as $k) $r[$k] = intOrNull($r[$k]);
                $es = $pdo->prepare("SELECT e.id, e.name FROM user_entities ue JOIN entities e ON e.id = ue.entity_id WHERE ue.user_id = ? ORDER BY e.name");
                $es->execute([$r['id']]);
                $r['entities'] = array_map(fn($e) => ["id" => (int)$e['id'], "name" => $e['name']], $es->fetchAll());
            }
            out($rows);
        }
        if ($method === 'POST') {
            $entityId = $qEntity ?: $user['entity_id'];
            requireManage($pdo, $user, $entityId);
            $username = trim($input['username'] ?? '');
            $password = $input['password'] ?? '';
            if ($username === '' || strlen($password) < 4) fail("Gebruikersnaam en wachtwoord (min. 4 tekens) zijn verplicht");
            $role = $input['role'] ?? 'user';
            if (!in_array($role, ['user', 'entity_admin', 'super_admin'], true) || ($role === 'super_admin' && !$isSuperAdmin)) $role = 'user';
            try {
                $pdo->prepare("INSERT INTO users (username, password_hash, role, entity_id) VALUES (?, ?, ?, ?)")
                    ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role, $entityId]);
            } catch (PDOException $e) {
                fail("Deze gebruikersnaam bestaat al");
            }
            $userId = (int)$pdo->lastInsertId();
            setupNewUser($pdo, $userId);
            $pdo->prepare("INSERT IGNORE INTO user_entities (user_id, entity_id, default_project_id, default_subject_id) VALUES (?, ?, ?, ?)")
                ->execute([$userId, $entityId, intOrNull($input['default_project_id'] ?? null), intOrNull($input['default_subject_id'] ?? null)]);
            out(["id" => $userId, "username" => $username, "role" => $role, "entity_id" => $entityId]);
        }
    }

    if (preg_match('/^\/admin\/users\/(\d+)$/', $path, $m) && $method === 'PUT') {
        $targetId = (int)$m[1];
        $entityId = $qEntity;
        if ($entityId) {
            requireManage($pdo, $user, $entityId);
            if (!in_array($entityId, userEntityIds($pdo, $targetId), true)) fail("Gebruiker hoort niet bij deze entiteit", 404);
        } elseif (!$isSuperAdmin) {
            fail("Kies een entiteit");
        }

        if (array_key_exists('role', $input)) {
            $role = $input['role'];
            if (in_array($role, ['user', 'entity_admin'], true) || ($role === 'super_admin' && $isSuperAdmin)) {
                if ($targetId === $user['id'] && $role !== $user['role']) fail("Je kunt je eigen rol niet wijzigen");
                $pdo->prepare("UPDATE users SET role = ? WHERE id = ?")->execute([$role, $targetId]);
            }
        }
        if ($entityId && (array_key_exists('default_project_id', $input) || array_key_exists('default_subject_id', $input))) {
            $pid = intOrNull($input['default_project_id'] ?? null);
            $sid = intOrNull($input['default_subject_id'] ?? null);
            if ($pid && projectEntity($pdo, $pid) !== $entityId) fail("Project hoort niet bij deze entiteit");
            if ($sid && subjectProject($pdo, $sid) !== $pid) $sid = null;
            $pdo->prepare("UPDATE user_entities SET default_project_id = ?, default_subject_id = ? WHERE user_id = ? AND entity_id = ?")
                ->execute([$pid, $sid, $targetId, $entityId]);
        }
        $pdo->prepare("INSERT IGNORE INTO settings (user_id) VALUES (?)")->execute([$targetId]);
        if (array_key_exists('schedule_rotation_weeks', $input)) {
            $w = intOrNull($input['schedule_rotation_weeks']);
            $pdo->prepare("UPDATE settings SET schedule_rotation_weeks = ? WHERE user_id = ?")
                ->execute([$w ? max(1, min(MAX_ROTATION_WEEKS, $w)) : null, $targetId]);
        }
        if (array_key_exists('rotation_start_date', $input)) {
            $d = $input['rotation_start_date'];
            $pdo->prepare("UPDATE settings SET rotation_start_date = ? WHERE user_id = ?")->execute([validDate($d) ? $d : '', $targetId]);
        }
        out(["ok" => true]);
    }

    // Bestaande gebruiker koppelen aan / loskoppelen van een entiteit
    if ($path === '/admin/user-entities') {
        requireManage($pdo, $user, $qEntity);
        if ($method === 'POST') {
            $stmt = $pdo->prepare("SELECT id, entity_id FROM users WHERE username = ?");
            $stmt->execute([trim($input['username'] ?? '')]);
            $target = $stmt->fetch();
            if (!$target) fail("Gebruiker niet gevonden", 404);
            $pdo->prepare("INSERT IGNORE INTO user_entities (user_id, entity_id) VALUES (?, ?)")->execute([$target['id'], $qEntity]);
            if (!$target['entity_id']) $pdo->prepare("UPDATE users SET entity_id = ? WHERE id = ?")->execute([$qEntity, $target['id']]);
            out(["ok" => true]);
        }
        if ($method === 'DELETE') {
            $targetId = intOrNull($_GET['user_id'] ?? null);
            if (!$targetId) fail("Gebruiker ontbreekt");
            $pdo->prepare("DELETE FROM user_entities WHERE user_id = ? AND entity_id = ?")->execute([$targetId, $qEntity]);
            $rest = userEntityIds($pdo, $targetId);
            $pdo->prepare("UPDATE users SET entity_id = ? WHERE id = ? AND entity_id = ?")->execute([$rest[0] ?? null, $targetId, $qEntity]);
            out(["ok" => true]);
        }
    }

    if ($path === '/admin/entity-settings') {
        $entityId = $qEntity ?: $user['entity_id'];
        requireManage($pdo, $user, $entityId);
        if ($method === 'GET') {
            $s = getEntitySettings($pdo, $entityId);
            if (empty($s['api_key'])) {
                $s['api_key'] = bin2hex(random_bytes(20));
                $pdo->prepare("UPDATE entity_settings SET api_key = ? WHERE entity_id = ?")->execute([$s['api_key'], $entityId]);
            }
            out($s);
        }
        if ($method === 'PUT') {
            $current = getEntitySettings($pdo, $entityId);
            $s = array_merge($current, array_intersect_key($input, $current));
            $approval = in_array($s['approval_required'], ['none', 'days', 'weeks', 'workweeks'], true) ? $s['approval_required'] : 'none';
            $projectMode = in_array($s['project_mode'], ['off', 'optional', 'required'], true) ? $s['project_mode'] : 'off';
            $webhookMode = in_array($s['webhook_mode'], ['off', 'realtime', 'on_submit', 'on_approval'], true) ? $s['webhook_mode'] : 'off';
            $url = trim((string)$s['webhook_url']);
            if ($url !== '' && !preg_match('#^https?://#i', $url)) fail("De webhook-URL moet met http:// of https:// beginnen");
            $pdo->prepare("UPDATE entity_settings SET time_step=?, allow_deviate_time_step=?, schedule_rotation_weeks=?, approval_required=?,
                    custom_registration_types=?, auto_split_overtime=?, allow_manual_split_overtime=?, project_mode=?, lock_default_project=?,
                    webhook_url=?, webhook_secret=?, webhook_mode=? WHERE entity_id=?")
                ->execute([
                    (int)$s['time_step'] ?: 30,
                    $s['allow_deviate_time_step'] ? 1 : 0,
                    max(1, min(MAX_ROTATION_WEEKS, (int)$s['schedule_rotation_weeks'] ?: 2)),
                    $approval,
                    (string)$s['custom_registration_types'],
                    $s['auto_split_overtime'] ? 1 : 0,
                    $s['allow_manual_split_overtime'] ? 1 : 0,
                    $projectMode,
                    $s['lock_default_project'] ? 1 : 0,
                    $url,
                    (string)$s['webhook_secret'],
                    $webhookMode,
                    $entityId,
                ]);
            out(getEntitySettings($pdo, $entityId));
        }
    }

    if ($path === '/admin/api-key' && $method === 'POST') {
        requireManage($pdo, $user, $qEntity);
        $key = bin2hex(random_bytes(20));
        $pdo->prepare("UPDATE entity_settings SET api_key = ? WHERE entity_id = ?")->execute([$key, $qEntity]);
        out(["api_key" => $key]);
    }

    if ($path === '/admin/webhook-test' && $method === 'POST') {
        requireManage($pdo, $user, $qEntity);
        $res = sendWebhook($pdo, $qEntity, 'test', ["message" => "Testbericht van de Werkuren-app", "registrations" => []], true);
        if ($res === null) fail("Vul eerst een webhook-URL in en sla op");
        out($res);
    }

    if ($path === '/admin/webhook-log' && $method === 'GET') {
        requireManage($pdo, $user, $qEntity);
        $stmt = $pdo->prepare("SELECT * FROM webhook_log WHERE entity_id = ? ORDER BY id DESC LIMIT 20");
        $stmt->execute([$qEntity]);
        out($stmt->fetchAll());
    }

    // ---- GOEDKEURINGEN ----
    if ($path === '/admin/submissions' && $method === 'GET') {
        requireManage($pdo, $user, $qEntity);
        $status = $_GET['status'] ?? 'submitted';
        $sql = "SELECT sb.*, u.username,
                (SELECT COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(r.end, r.start))) / 60, 0) FROM registrations r
                  WHERE r.user_id = sb.user_id AND r.entity_id = sb.entity_id AND r.date BETWEEN sb.period_start AND sb.period_end
                  AND LOWER(r.type) <> 'pauze') AS total_minutes
            FROM submissions sb JOIN users u ON u.id = sb.user_id WHERE sb.entity_id = ?";
        $params = [$qEntity];
        if ($status !== 'all') {
            $sql .= " AND sb.status = ?";
            $params[] = $status;
        }
        $stmt = $pdo->prepare($sql . " ORDER BY sb.period_start DESC, u.username LIMIT 200");
        $stmt->execute($params);
        out(array_map(function ($s) {
            foreach (['id', 'user_id', 'entity_id', 'decided_by'] as $k) $s[$k] = intOrNull($s[$k]);
            $s['total_minutes'] = (int)round($s['total_minutes']);
            return $s;
        }, $stmt->fetchAll()));
    }

    if (preg_match('/^\/admin\/submissions\/(\d+)$/', $path, $m)) {
        $sub = getSubmission($pdo, $m[1]);
        if (!$sub) fail("Niet gevonden", 404);
        requireManage($pdo, $user, $sub['entity_id']);
        if ($method === 'GET') {
            out(["submission" => $sub, "registrations" => submissionRegs($pdo, $sub)]);
        }
        if ($method === 'PUT') {
            $status = $input['status'] ?? '';
            if (!in_array($status, ['approved', 'rejected'], true)) fail("Ongeldige status");
            $pdo->prepare("UPDATE submissions SET status = ?, comment = ?, decided_at = NOW(), decided_by = ? WHERE id = ?")
                ->execute([$status, (string)($input['comment'] ?? ''), $user['id'], $sub['id']]);
            $pdo->prepare("UPDATE registrations SET status = ? WHERE user_id = ? AND entity_id = ? AND date BETWEEN ? AND ?")
                ->execute([$status === 'approved' ? 'approved' : 'draft', $sub['user_id'], $sub['entity_id'], $sub['period_start'], $sub['period_end']]);
            $sub = getSubmission($pdo, $sub['id']);
            if ($status === 'approved') submissionWebhook($pdo, $sub, 'submission.approved');
            out($sub);
        }
    }

    // ---- PROJECTEN ----
    if ($path === '/admin/projects') {
        $entityId = $qEntity ?: $user['entity_id'];
        requireManage($pdo, $user, $entityId);
        if ($method === 'GET') {
            $stmt = $pdo->prepare("SELECT * FROM projects WHERE entity_id = ? ORDER BY name");
            $stmt->execute([$entityId]);
            out($stmt->fetchAll());
        }
        if ($method === 'POST') {
            $name = trim($input['name'] ?? '');
            if ($name === '') fail("Naam is verplicht");
            $pdo->prepare("INSERT INTO projects (entity_id, name, is_active) VALUES (?, ?, 1)")->execute([$entityId, $name]);
            out(["id" => (int)$pdo->lastInsertId(), "entity_id" => $entityId, "name" => $name, "is_active" => 1]);
        }
    }

    if (preg_match('/^\/admin\/projects\/(\d+)$/', $path, $m)) {
        $projectId = (int)$m[1];
        requireManage($pdo, $user, projectEntity($pdo, $projectId));
        if ($method === 'PUT') {
            $pdo->prepare("UPDATE projects SET name=?, is_active=? WHERE id=?")->execute([$input['name'], !empty($input['is_active']) ? 1 : 0, $projectId]);
            out(["ok" => true]);
        }
        if ($method === 'DELETE') {
            $pdo->prepare("DELETE FROM subjects WHERE project_id=?")->execute([$projectId]);
            $pdo->prepare("DELETE FROM projects WHERE id=?")->execute([$projectId]);
            out(["ok" => true]);
        }
    }

    // ---- SUBJECTEN ----
    if ($path === '/admin/subjects') {
        if ($method === 'GET') {
            $projectId = intOrNull($_GET['project_id'] ?? null);
            requireManage($pdo, $user, projectEntity($pdo, $projectId));
            $stmt = $pdo->prepare("SELECT * FROM subjects WHERE project_id = ? ORDER BY name");
            $stmt->execute([$projectId]);
            out($stmt->fetchAll());
        }
        if ($method === 'POST') {
            $projectId = intOrNull($input['project_id'] ?? null);
            requireManage($pdo, $user, projectEntity($pdo, $projectId));
            $name = trim($input['name'] ?? '');
            if ($name === '') fail("Naam is verplicht");
            $pdo->prepare("INSERT INTO subjects (project_id, name, is_active) VALUES (?, ?, 1)")->execute([$projectId, $name]);
            out(["id" => (int)$pdo->lastInsertId(), "project_id" => $projectId, "name" => $name, "is_active" => 1]);
        }
    }

    if (preg_match('/^\/admin\/subjects\/(\d+)$/', $path, $m)) {
        $subjectId = (int)$m[1];
        requireManage($pdo, $user, projectEntity($pdo, subjectProject($pdo, $subjectId)));
        if ($method === 'PUT') {
            $pdo->prepare("UPDATE subjects SET name=?, is_active=? WHERE id=?")->execute([$input['name'], !empty($input['is_active']) ? 1 : 0, $subjectId]);
            out(["ok" => true]);
        }
        if ($method === 'DELETE') {
            $pdo->prepare("DELETE FROM subjects WHERE id=?")->execute([$subjectId]);
            out(["ok" => true]);
        }
    }
}

fail("Onbekende route", 404);
