#ifndef STOCKLIST_H
#define STOCKLIST_H

#include <pqxx/pqxx>

void createStockList(pqxx::work& W, int userID, const std::string& listName, bool visibility);
void viewStockLists(pqxx::nontransaction& N, int userID);

#endif
