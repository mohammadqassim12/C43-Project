#ifndef STOCK_H
#define STOCK_H

#include <pqxx/pqxx>

void addStockData(pqxx::work& W, const std::string& symbol, const std::string& timestamp, double open, double high, double low, double close, int volume);
void viewStockData(pqxx::nontransaction& N, const std::string& symbol);

#endif
