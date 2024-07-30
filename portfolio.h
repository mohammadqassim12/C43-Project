#ifndef PORTFOLIO_H
#define PORTFOLIO_H

#include <pqxx/pqxx>

void createPortfolio(pqxx::work& W, int userID, double cashAmount);
void viewPortfolios(pqxx::nontransaction& N, int userID);

#endif
