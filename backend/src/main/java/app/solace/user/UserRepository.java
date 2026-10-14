package app.solace.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByUsernameLower(String usernameLower);

    boolean existsByUsernameLower(String usernameLower);
}
