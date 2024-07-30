#include "user.h"
#include <iostream> // Include this for std::cout

void registerUser(pqxx::work& W, const std::string& name, const std::string& email, const std::string& password) {
    std::string sql = "INSERT INTO Users (name, email, password) VALUES (" + W.quote(name) + ", " + W.quote(email) + ", " + W.quote(password) + ") RETURNING userID;";
    pqxx::result R = W.exec(sql);
    W.commit();
    int userID = R[0]["userID"].as<int>();
    std::cout << "User registered successfully with userID: " << userID << "\n";
}

bool loginUser(pqxx::nontransaction& N, const std::string& email, const std::string& password, int &userID) {
    std::string sql = "SELECT userID, password FROM Users WHERE email = " + N.quote(email) + ";";
    pqxx::result R = N.exec(sql);
    if (R.size() == 1) {
        std::string stored_password = R[0]["password"].as<std::string>();
        if (stored_password == password) {
            userID = R[0]["userID"].as<int>();
            std::cout << "Login successful. UserID: " << userID << "\n";
            return true;
        }
    }
    std::cout << "Login failed\n";
    return false;
}

void logoutUser(int &currentUserID) {
    if (currentUserID != -1) {
        currentUserID = -1;
        std::cout << "User logged out successfully.\n";
    } else {
        std::cout << "No user is currently logged in.\n";
    }
}
