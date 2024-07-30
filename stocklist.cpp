#include "stocklist.h"
#include <iostream> 

void createStockList(pqxx::work& W, int userID, const std::string& listName, bool visibility) {
    std::string sql = "INSERT INTO StockLists (userID, listName, visibility) VALUES (" + W.quote(userID) + ", " + W.quote(listName) + ", " + W.quote(visibility) + ");";
    W.exec(sql);
    W.commit();
}

void viewStockLists(pqxx::nontransaction& N, int userID) {
    std::string sql = "SELECT * FROM StockLists WHERE userID = " + N.quote(userID) + ";";
    pqxx::result R(N.exec(sql));
    std::cout << "Stock Lists:\nlistName \tvisibility" << std::endl;
    for (auto row : R) {
        std::cout << row["listName"].as<std::string>() << " \t" << row["visibility"].as<bool>() << std::endl;
    }
}
