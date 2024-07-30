#ifndef USER_H
#define USER_H

#include <pqxx/pqxx>

void registerUser(pqxx::work& W, const std::string& name, const std::string& email, const std::string& password);
bool loginUser(pqxx::nontransaction& N, const std::string& email, const std::string& password, int &userID);
void logoutUser(int &currentUserID);

#endif
