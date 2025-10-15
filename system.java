import java.io.*;
import java.net.InetSocketAddress;
import com.sun.net.httpserver.*;

public class SystemInfoAgent {
    public static void main(String[] args) throws Exception {
        int port = 8080; // change if needed
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/metrics", new MetricsHandler());
        server.setExecutor(null);
        server.start();
        System.out.println("Agent started on port " + port);
    }

    static class MetricsHandler implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            String response = getSystemInfo();
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length());
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response.getBytes());
            }
        }

        private String getSystemInfo() {
            try {
                String hostname = runCommand("hostname");
                String uptime = runCommand("uptime -p");
                String mem = runCommand("free -m");
                String disk = runCommand("df -h /");
                return String.format(
                    "{\"hostname\":\"%s\",\"uptime\":\"%s\",\"mem\":\"%s\",\"disk\":\"%s\"}",
                    escape(hostname), escape(uptime), escape(mem), escape(disk)
                );
            } catch (Exception e) {
                return "{\"error\":\"" + e.getMessage() + "\"}";
            }
        }

        private String runCommand(String cmd) throws IOException, InterruptedException {
            Process p = Runtime.getRuntime().exec(cmd);
            BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line).append("\\n");
            p.waitFor();
            return sb.toString();
        }

        private String escape(String s) {
            return s.replace("\"", "\\\"").trim();
        }
    }
}
