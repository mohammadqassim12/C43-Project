#ifndef SOCIAL_H
#define SOCIAL_H

#include <pqxx/pqxx>

void sendFriendRequest(pqxx::work& W, int fromUserID, int toUserID);
void viewFriendRequests(pqxx::nontransaction& N, int userID);
void acceptFriendRequest(pqxx::work& W, int fromUserID, int toUserID);
void viewFriends(pqxx::nontransaction& N, int userID);

#endif
