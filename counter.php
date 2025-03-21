<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

try {
    $counterFile = __DIR__ . '/counter.txt';

    if (!file_exists($counterFile)) {
        file_put_contents($counterFile, '1');
        $count = 1;
    } else {
        $count = (int)file_get_contents($counterFile);
        if ($count < 1) $count = 1;
        $count++;
        if (!file_put_contents($counterFile, $count)) {
            throw new Exception('Could not write to counter file');
        }
    }

    echo json_encode(['count' => $count, 'status' => 'success']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
