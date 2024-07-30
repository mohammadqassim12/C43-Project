#ifndef REVIEW_H
#define REVIEW_H

#include <pqxx/pqxx>

void addReview(pqxx::work& W, int userID, const std::string& listName, const std::string& text);
void viewReviews(pqxx::nontransaction& N, const std::string& listName);

#endif
