#include "stock.h"
#include <iostream>
#include <fstream>
#include <sstream>

void addStockData(pqxx::work& W, const std::string& code, const std::string& timestamp, double open, double high, double low, double close, int volume) {
    std::string sql = "INSERT INTO Stocks (code, timestamp, open, high, low, close, volume) VALUES (" 
        + W.quote(code) + ", " 
        + W.quote(timestamp) + ", " 
        + W.quote(open) + ", " 
        + W.quote(high) + ", " 
        + W.quote(low) + ", " 
        + W.quote(close) + ", " 
        + W.quote(volume) + ");";
    W.exec(sql);
}

void viewStockData(pqxx::nontransaction& N, const std::string& code) {
    std::string sql = "SELECT * FROM Stocks WHERE code = " + N.quote(code) + ";";
    pqxx::result R = N.exec(sql);
    std::cout << "Stock Data for " << code << ":\ntimestamp \topen \thigh \tlow \tclose \tvolume" << std::endl;
    for (auto row : R) {
        std::cout << row["timestamp"].as<std::string>() << " \t" 
                  << row["open"].as<double>() << " \t" 
                  << row["high"].as<double>() << " \t" 
                  << row["low"].as<double>() << " \t" 
                  << row["close"].as<double>() << " \t" 
                  << row["volume"].as<int>() << std::endl;
    }
}

void importCSVData(pqxx::connection& C, const std::string& filePath) {
    std::ifstream file(filePath);
    if (!file.is_open()) {
        std::cerr << "Could not open the file: " << filePath << std::endl;
        return;
    }

    std::string line;
    std::getline(file, line); // Skip the header line

    pqxx::work W(C);
    while (std::getline(file, line)) {
        std::stringstream ss(line);
        std::string code, timestamp;
        double open, high, low, close;
        int volume;

        std::getline(ss, timestamp, ',');
        ss >> open;
        ss.ignore();
        ss >> high;
        ss.ignore();
        ss >> low;
        ss.ignore();
        ss >> close;
        ss.ignore();
        ss >> volume;
        ss.ignore();
        std::getline(ss, code, ',');

        try {
            addStockData(W, code, timestamp, open, high, low, close, volume);
        } catch (const std::exception &e) {
            std::cerr << "Error inserting row: " << e.what() << std::endl;
        }

        std::cout << "Processed row: " << code << ", " << timestamp << ", " << open << ", " << high << ", " << low << ", " << close << ", " << volume << std::endl;
    }

    try {
        W.commit();
        std::cout << "CSV data imported successfully from " << filePath << "\n";
    } catch (const std::exception &e) {
        std::cerr << "Error committing transaction: " << e.what() << std::endl;
    }

    file.close();
}
