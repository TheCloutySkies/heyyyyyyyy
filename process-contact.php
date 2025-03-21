<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    try {
        $to = "charliesierra007@protonmail.ch";
        $subject = filter_var($_POST['subject'], FILTER_SANITIZE_STRING);
        $name = filter_var($_POST['name'], FILTER_SANITIZE_STRING);
        $email = filter_var($_POST['email'], FILTER_SANITIZE_EMAIL);
        $message = filter_var($_POST['message'], FILTER_SANITIZE_STRING);
        
        if (!$email || !$name || !$message) {
            throw new Exception('Invalid input data');
        }

        $fullMessage = "From: " . $name . "\n";
        $fullMessage .= "Email: " . $email . "\n\n";
        $fullMessage .= $message;
        
        $headers = "From: " . $email;
        
        if(!mail($to, $subject, $fullMessage, $headers)) {
            throw new Exception('Mail sending failed');
        }
        
        http_response_code(200);
        echo json_encode(['status' => 'success']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
?>
