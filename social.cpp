#include "social.h"
#include <iostream>

void sendFriendRequest(pqxx::work& W, int fromUserID, int toUserID) {
    std::string sql = "INSERT INTO Requests (fromUserID, toUserID, status, timePassed) VALUES (" + W.quote(fromUserID) + ", " + W.quote(toUserID) + ", 'pending', 0);";
    W.exec(sql);
    W.commit();
}

void viewFriendRequests(pqxx::nontransaction& N, int userID) {
    std::string sql = "SELECT * FROM Requests WHERE toUserID = " + N.quote(userID) + " AND status = 'pending';";
    pqxx::result R(N.exec(sql));
    std::cout << "Friend Requests:\nfromUserID \tstatus" << std::endl;
    for (auto row : R) {
        std::cout << row["fromUserID"].as<int>() << " \t" << row["status"].as<std::string>() << std::endl;
    }
}

void acceptFriendRequest(pqxx::work& W, int fromUserID, int toUserID) {
    std::string sql = "UPDATE Requests SET status = 'accepted' WHERE fromUserID = " + W.quote(fromUserID) + " AND toUserID = " + W.quote(toUserID) + ";";
    W.exec(sql);
    sql = "INSERT INTO Friends (friend1, friend2) VALUES (" + W.quote(fromUserID) + ", " + W.quote(toUserID) + ");";
    W.exec(sql);
    W.commit();
}
