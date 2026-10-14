package app.solace;

import app.solace.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class SolaceApplication {
    public static void main(String[] args) {
        SpringApplication.run(SolaceApplication.class, args);
    }
}
