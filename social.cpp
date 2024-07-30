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
    sql = "INSERT INTO Friends (userID1, userID2) VALUES (" + W.quote(fromUserID) + ", " + W.quote(toUserID) + ");";
    W.exec(sql);
    W.commit();
}

void viewFriends(pqxx::nontransaction& N, int userID) {
    std::string sql = "SELECT userID2 AS friendID FROM Friends WHERE userID1 = " + N.quote(userID) 
                    + " UNION SELECT userID1 AS friendID FROM Friends WHERE userID2 = " + N.quote(userID) + ";";
    pqxx::result R = N.exec(sql);
    std::cout << "Friends of userID " << userID << ":\n";
    for (auto row : R) {
        std::cout << row["friendID"].as<int>() << std::endl;
    }
}
