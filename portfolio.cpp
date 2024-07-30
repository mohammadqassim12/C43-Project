#include "portfolio.h"
#include <iostream> 

void createPortfolio(pqxx::work& W, int userID, double cashAmount) {
    std::string sql = "INSERT INTO Portfolios (userID, cashAmount) VALUES (" + W.quote(userID) + ", " + W.quote(cashAmount) + ");";
    W.exec(sql);
    W.commit();
}

void viewPortfolios(pqxx::nontransaction& N, int userID) {
    std::string sql = "SELECT * FROM Portfolios WHERE userID = " + N.quote(userID) + ";";
    pqxx::result R(N.exec(sql));
    std::cout << "Portfolios:\nportfolioID \tcashAmount" << std::endl;
    for (auto row : R) {
        std::cout << row["portfolioID"].as<int>() << " \t" << row["cashAmount"].as<double>() << std::endl;
    }
}
