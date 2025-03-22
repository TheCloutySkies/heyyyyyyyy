<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

try {
    $counterFile = __DIR__ . '/counter.txt';
    $lockFile = __DIR__ . '/counter.lock';

    // Use file locking to prevent race conditions
    $lock = fopen($lockFile, 'w');
    if (!flock($lock, LOCK_EX)) {
        throw new Exception('Could not lock counter file');
    }

    if (!file_exists($counterFile)) {
        $count = 1;
    } else {
        $count = (int)file_get_contents($counterFile);
        if ($count < 1) $count = 1;
        $count++;
    }

    if (file_put_contents($counterFile, $count) === false) {
        throw new Exception('Could not write to counter file');
    }

    flock($lock, LOCK_UN);
    fclose($lock);

    echo json_encode([
        'count' => $count,
        'status' => 'success'
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>
