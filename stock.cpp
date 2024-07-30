#include "stock.h"
#include <iostream>

void addStockData(pqxx::work& W, const std::string& symbol, const std::string& timestamp, double open, double high, double low, double close, int volume) {
    std::string sql = "INSERT INTO Stocks (symbol, timestamp, open, high, low, close, volume) VALUES (" + W.quote(symbol) + ", " + W.quote(timestamp) + ", " + W.quote(open) + ", " + W.quote(high) + ", " + W.quote(low) + ", " + W.quote(close) + ", " + W.quote(volume) + ");";
    W.exec(sql);
    W.commit();
}

void viewStockData(pqxx::nontransaction& N, const std::string& symbol) {
    std::string sql = "SELECT * FROM Stocks WHERE symbol = " + N.quote(symbol) + ";";
    pqxx::result R(N.exec(sql));
    std::cout << "Stock Data for " << symbol << ":\ntimestamp \topen \thigh \tlow \tclose \tvolume" << std::endl;
    for (auto row : R) {
        std::cout << row["timestamp"].as<std::string>() << " \t" << row["open"].as<double>() << " \t" << row["high"].as<double>() << " \t" << row["low"].as<double>() << " \t" << row["close"].as<double>() << " \t" << row["volume"].as<int>() << std::endl;
    }
}
