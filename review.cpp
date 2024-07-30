#include "review.h"
#include <iostream>

void addReview(pqxx::work& W, int userID, const std::string& listName, const std::string& text) {
    std::string sql = "INSERT INTO Reviews (userID, listName, text) VALUES (" + W.quote(userID) + ", " + W.quote(listName) + ", " + W.quote(text) + ");";
    W.exec(sql);
    W.commit();
}

void viewReviews(pqxx::nontransaction& N, const std::string& listName) {
    std::string sql = "SELECT * FROM Reviews WHERE listName = " + N.quote(listName) + ";";
    pqxx::result R(N.exec(sql));
    std::cout << "Reviews for " << listName << ":\nuserID \ttext" << std::endl;
    for (auto row : R) {
        std::cout << row["userID"].as<int>() << " \t" << row["text"].as<std::string>() << std::endl;
    }
}
