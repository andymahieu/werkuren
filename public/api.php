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
 *     role VARCHAR(50) DEFAULT 'user',
 *     entity_id INT,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 * 
 * CREATE TABLE IF NOT EXISTS companies (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     name VARCHAR(255) NOT NULL,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 * 
 * CREATE TABLE IF NOT EXISTS entities (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     company_id INT NOT NULL,
 *     name VARCHAR(255) NOT NULL,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *     FOREIGN KEY (company_id) REFERENCES companies(id)
 * );
 * 
 * CREATE TABLE IF NOT EXISTS entity_settings (
 *     entity_id INT PRIMARY KEY,
 *     time_step INT DEFAULT 30,
 *     allow_deviate_time_step TINYINT(1) DEFAULT 0,
 *     schedule_rotation_weeks INT DEFAULT 2,
 *     approval_required VARCHAR(50) DEFAULT 'none',
 *     custom_registration_types TEXT,
 *     auto_split_overtime TINYINT(1) DEFAULT 0,
 *     allow_manual_split_overtime TINYINT(1) DEFAULT 1,
 *     FOREIGN KEY (entity_id) REFERENCES entities(id)
 * );
 * 
 * CREATE TABLE IF NOT EXISTS projects (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     entity_id INT NOT NULL,
 *     name VARCHAR(255) NOT NULL,
 *     is_active TINYINT(1) DEFAULT 1,
 *     FOREIGN KEY (entity_id) REFERENCES entities(id)
 * );
 * 
 * CREATE TABLE IF NOT EXISTS subjects (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     project_id INT NOT NULL,
 *     name VARCHAR(255) NOT NULL,
 *     is_active TINYINT(1) DEFAULT 1,
 *     FOREIGN KEY (project_id) REFERENCES projects(id)
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
 *     project_id INT,
 *     subject_id INT,
 *     status VARCHAR(50) DEFAULT 'draft',
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
 *     time_step INT DEFAULT 30,
 *     default_project_id INT,
 *     default_subject_id INT,
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
    
    echo json_encode(["token" => createJWT($userId, $input['username'], $jwt_secret), "user" => ["id" => $userId, "username" => $input['username'], "role" => "super_admin", "entity_id" => null]]);
    exit();
}

if ($path === '/auth/login' && $method === 'POST') {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$input['username']]);
    $user = $stmt->fetch();
    if ($user && password_verify($input['password'], $user['password_hash'])) {
        echo json_encode(["token" => createJWT($user['id'], $user['username'], $jwt_secret), "user" => ["id" => $user['id'], "username" => $user['username'], "role" => $user['role'], "entity_id" => $user['entity_id']]]);
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
        $stmt = $pdo->prepare("SELECT s.*, e.time_step as e_time_step, e.allow_deviate_time_step, e.schedule_rotation_weeks, e.approval_required, e.custom_registration_types, e.auto_split_overtime, e.allow_manual_split_overtime FROM settings s LEFT JOIN users u ON s.user_id = u.id LEFT JOIN entity_settings e ON u.entity_id = e.entity_id WHERE s.user_id = ?");
        $stmt->execute([$user['id']]);
        $r = $stmt->fetch();
        echo json_encode([
            "overtimeBalance" => $r['overtime_balance'] ?? 0, 
            "employeeStartDate" => $r['employee_start_date'] ?? '',
            "country" => $r['country'] ?? 'BE',
            "timeStep" => $r['time_step'] ?? 30,
            "entityTimeStep" => $r['e_time_step'] ?? 30,
            "allowDeviateTimeStep" => (bool)($r['allow_deviate_time_step'] ?? false),
            "scheduleRotationWeeks" => $r['schedule_rotation_weeks'] ?? 2,
            "approvalRequired" => $r['approval_required'] ?? 'none',
            "customRegistrationTypes" => $r['custom_registration_types'] ?? 'Werk,Pauze,Ziekte,Verlof',
            "autoSplitOvertime" => (bool)($r['auto_split_overtime'] ?? false),
            "allowManualSplitOvertime" => isset($r['allow_manual_split_overtime']) ? (bool)$r['allow_manual_split_overtime'] : true,
            "defaultProjectId" => $r['default_project_id'],
            "defaultSubjectId" => $r['default_subject_id']
        ]);
    } elseif ($method === 'PUT') {
        // Zorg dat de kolom bestaat als deze oud is
        try {
            $pdo->exec("ALTER TABLE settings ADD COLUMN time_step INT DEFAULT 30");
        } catch (PDOException $e) {}

        $pdo->prepare("UPDATE settings SET overtime_balance=?, employee_start_date=?, country=?, time_step=? WHERE user_id=?")
            ->execute([$input['overtimeBalance'], $input['employeeStartDate'], $input['country'] ?? 'BE', $input['timeStep'] ?? 30, $user['id']]);
        echo json_encode(["ok" => true]);
    }
    exit();
}

// 3. ADMIN & MULTI-TENANCY
$isAdmin = isset($user['role']) && ($user['role'] === 'super_admin' || $user['role'] === 'entity_admin');
$isSuperAdmin = isset($user['role']) && $user['role'] === 'super_admin';

if (strpos($path, '/admin/') === 0) {
    if (!$isAdmin) {
        http_response_code(403);
        die(json_encode(["error" => "Admin rechten vereist"]));
    }

    if ($path === '/admin/companies' && $isSuperAdmin) {
        if ($method === 'GET') {
            echo json_encode($pdo->query("SELECT * FROM companies")->fetchAll());
        } elseif ($method === 'POST') {
            $stmt = $pdo->prepare("INSERT INTO companies (name) VALUES (?)");
            $stmt->execute([$input['name']]);
            echo json_encode(["id" => $pdo->lastInsertId(), "name" => $input['name']]);
        }
        exit();
    }

    if ($path === '/admin/entities' && $isSuperAdmin) {
        if ($method === 'GET') {
            echo json_encode($pdo->query("SELECT e.*, c.name as company_name FROM entities e JOIN companies c ON e.company_id = c.id")->fetchAll());
        } elseif ($method === 'POST') {
            $stmt = $pdo->prepare("INSERT INTO entities (name, company_id) VALUES (?, ?)");
            $stmt->execute([$input['name'], $input['company_id']]);
            $id = $pdo->lastInsertId();
            $pdo->prepare("INSERT INTO entity_settings (entity_id) VALUES (?)")->execute([$id]);
            echo json_encode(["id" => $id, "name" => $input['name'], "company_id" => $input['company_id']]);
        }
        exit();
    }

    if ($path === '/admin/users') {
        if ($method === 'GET') {
            if ($isSuperAdmin) {
                echo json_encode($pdo->query("SELECT id, username, role, entity_id, created_at FROM users")->fetchAll());
            } else {
                $stmt = $pdo->prepare("SELECT id, username, role, entity_id, created_at FROM users WHERE entity_id = ?");
                $stmt->execute([$user['entity_id']]);
                echo json_encode($stmt->fetchAll());
            }
        } elseif ($method === 'POST') {
            $targetEntityId = $isSuperAdmin ? $input['entity_id'] : $user['entity_id'];
            $targetRole = (!$isSuperAdmin && $input['role'] === 'super_admin') ? 'user' : ($input['role'] ?? 'user');
            
            try {
                $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role, entity_id) VALUES (?, ?, ?, ?)");
                $stmt->execute([$input['username'], password_hash($input['password'], PASSWORD_DEFAULT), $targetRole, $targetEntityId]);
                $userId = $pdo->lastInsertId();
                
                // Defaults
                for ($i = 0; $i < 14; $i++) {
                    $isActive = ($i % 7) >= 0 && ($i % 7) <= 3 ? 1 : 0;
                    $pdo->prepare("INSERT INTO base_schedule (user_id, day_index, active) VALUES (?, ?, ?)")
                        ->execute([$userId, $i, $isActive]);
                }
                $pdo->prepare("INSERT INTO settings (user_id) VALUES (?)")->execute([$userId]);
                
                echo json_encode(["id" => $userId, "username" => $input['username'], "role" => $targetRole, "entity_id" => $targetEntityId]);
            } catch(PDOException $e) {
                http_response_code(400);
                echo json_encode(["error" => "Fout bij aanmaken gebruiker (bestaat de naam al?)"]);
            }
        }
        exit();
    }

    if ($path === '/admin/entity-settings') {
        $targetEntityId = $isSuperAdmin ? ($_GET['entity_id'] ?? $input['entity_id']) : $user['entity_id'];
        
        if ($method === 'GET') {
            $stmt = $pdo->prepare("SELECT * FROM entity_settings WHERE entity_id = ?");
            $stmt->execute([$targetEntityId]);
            $settings = $stmt->fetch();
            if (!$settings) {
                $pdo->prepare("INSERT INTO entity_settings (entity_id) VALUES (?)")->execute([$targetEntityId]);
                $stmt->execute([$targetEntityId]);
                $settings = $stmt->fetch();
            }
            echo json_encode($settings);
        } elseif ($method === 'PUT') {
            $allowManual = isset($input['allow_manual_split_overtime']) ? ($input['allow_manual_split_overtime'] ? 1 : 0) : 1;
            $stmt = $pdo->prepare("UPDATE entity_settings SET time_step=?, allow_deviate_time_step=?, schedule_rotation_weeks=?, approval_required=?, custom_registration_types=?, auto_split_overtime=?, allow_manual_split_overtime=? WHERE entity_id=?");
            $stmt->execute([
                $input['time_step'], 
                $input['allow_deviate_time_step'] ? 1 : 0, 
                $input['schedule_rotation_weeks'], 
                $input['approval_required'], 
                $input['custom_registration_types'],
                $input['auto_split_overtime'] ? 1 : 0,
                $allowManual,
                $targetEntityId
            ]);
            echo json_encode(["ok" => true]);
        }
        exit();
    }

    // ---- PROJECTS ----
    if ($path === '/admin/projects') {
        if ($method === 'GET') {
            $entityId = $isSuperAdmin ? ($_GET['entity_id'] ?? null) : $user['entity_id'];
            $stmt = $pdo->prepare("SELECT * FROM projects WHERE entity_id = ? ORDER BY name");
            $stmt->execute([$entityId]);
            echo json_encode($stmt->fetchAll());
        } elseif ($method === 'POST') {
            $entityId = $isSuperAdmin ? $input['entity_id'] : $user['entity_id'];
            $stmt = $pdo->prepare("INSERT INTO projects (entity_id, name, is_active) VALUES (?, ?, 1)");
            $stmt->execute([$entityId, $input['name']]);
            echo json_encode(["id" => $pdo->lastInsertId(), "entity_id" => $entityId, "name" => $input['name'], "is_active" => 1]);
        }
        exit();
    }

    if (preg_match('/^\/admin\/projects\/(\d+)$/', $path, $m)) {
        $projectId = $m[1];
        if ($method === 'PUT') {
            $pdo->prepare("UPDATE projects SET name=?, is_active=? WHERE id=?")->execute([$input['name'], $input['is_active'] ? 1 : 0, $projectId]);
            echo json_encode(["ok" => true]);
        } elseif ($method === 'DELETE') {
            $pdo->prepare("DELETE FROM subjects WHERE project_id=?")->execute([$projectId]);
            $pdo->prepare("DELETE FROM projects WHERE id=?")->execute([$projectId]);
            echo json_encode(["ok" => true]);
        }
        exit();
    }

    // ---- SUBJECTS ----
    if ($path === '/admin/subjects') {
        if ($method === 'GET') {
            if (isset($_GET['project_id'])) {
                $stmt = $pdo->prepare("SELECT * FROM subjects WHERE project_id = ? ORDER BY name");
                $stmt->execute([$_GET['project_id']]);
            } else {
                $stmt = $pdo->prepare("SELECT s.*, p.name as project_name FROM subjects s JOIN projects p ON s.project_id = p.id JOIN entities e ON p.entity_id = e.id WHERE e.id = ?");
                $stmt->execute([$user['entity_id']]);
            }
            echo json_encode($stmt->fetchAll());
        } elseif ($method === 'POST') {
            $stmt = $pdo->prepare("INSERT INTO subjects (project_id, name, is_active) VALUES (?, ?, 1)");
            $stmt->execute([$input['project_id'], $input['name']]);
            echo json_encode(["id" => $pdo->lastInsertId(), "project_id" => $input['project_id'], "name" => $input['name'], "is_active" => 1]);
        }
        exit();
    }

    if (preg_match('/^\/admin\/subjects\/(\d+)$/', $path, $m)) {
        $subjectId = $m[1];
        if ($method === 'PUT') {
            $pdo->prepare("UPDATE subjects SET name=?, is_active=? WHERE id=?")->execute([$input['name'], $input['is_active'] ? 1 : 0, $subjectId]);
            echo json_encode(["ok" => true]);
        } elseif ($method === 'DELETE') {
            $pdo->prepare("DELETE FROM subjects WHERE id=?")->execute([$subjectId]);
            echo json_encode(["ok" => true]);
        }
        exit();
    }
}
