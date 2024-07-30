#include <iostream>
#include <pqxx/pqxx>
#include "user.h"
#include "portfolio.h"
#include "stocklist.h"
#include "stock.h"
#include "social.h"
#include "review.h"

int currentUserID = -1; // Global variable to track the logged-in user

void displayMenu() {
    std::cout << "Menu:\n";
    std::cout << "1. Register User\n";
    std::cout << "2. Login User\n";
    std::cout << "3. Logout User\n";
    std::cout << "4. Create Portfolio\n";
    std::cout << "5. View Portfolios\n";
    std::cout << "6. Create Stock List\n";
    std::cout << "7. View Stock Lists\n";
    std::cout << "8. Add Stock Data\n";
    std::cout << "9. View Stock Data\n";
    std::cout << "10. Send Friend Request\n";
    std::cout << "11. View Friend Requests\n";
    std::cout << "12. Accept Friend Request\n";
    std::cout << "13. Add Review\n";
    std::cout << "14. View Reviews\n";
    std::cout << "0. Exit\n";
    std::cout << "Enter your choice: ";
}

int main() {
    try {
        pqxx::connection C("dbname=mydb user=postgres password=admin hostaddr=34.170.251.68 port=5432");
        if (C.is_open()) {
            std::cout << "Opened database successfully: " << C.dbname() << std::endl;
        } else {
            std::cout << "Can't open database" << std::endl;
            return 1;
        }

        int choice;
        std::string name, email, password, listName, symbol, timestamp, text;
        double cashAmount, open, high, low, close;
        int value, fromUserID, toUserID, volume;

        while (true) {
            displayMenu();
            std::cin >> choice;
            switch (choice) {
                case 1: {
                    std::cout << "Enter name: ";
                    std::cin >> name;
                    std::cout << "Enter email: ";
                    std::cin >> email;
                    std::cout << "Enter password: ";
                    std::cin >> password;
                    pqxx::work W(C);
                    registerUser(W, name, email, password);
                    break;
                }
                case 2: {
                    std::cout << "Enter email: ";
                    std::cin >> email;
                    std::cout << "Enter password: ";
                    std::cin >> password;
                    pqxx::nontransaction N(C);
                    loginUser(N, email, password, currentUserID);
                    break;
                }
                case 3: {
                    logoutUser(currentUserID);
                    break;
                }
                case 4: {
                    if (currentUserID == -1) {
                        std::cout << "Please log in first.\n";
                        break;
                    }
                    std::cout << "Enter cash amount: ";
                    std::cin >> cashAmount;
                    pqxx::work W(C);
                    createPortfolio(W, currentUserID, cashAmount);
                    break;
                }
                case 5: {
                    if (currentUserID == -1) {
                        std::cout << "Please log in first.\n";
                        break;
                    }
                    pqxx::nontransaction N(C);
                    viewPortfolios(N, currentUserID);
                    break;
                }
                case 6: {
                    if (currentUserID == -1) {
                        std::cout << "Please log in first.\n";
                        break;
                    }
                    std::cout << "Enter list name: ";
                    std::cin >> listName;
                    std::cout << "Enter visibility (1 for true, 0 for false): ";
                    std::cin >> value;
                    pqxx::work W(C);
                    createStockList(W, currentUserID, listName, value);
                    break;
                }
                case 7: {
                    if (currentUserID == -1) {
                        std::cout << "Please log in first.\n";
                        break;
                    }
                    pqxx::nontransaction N(C);
                    viewStockLists(N, currentUserID);
                    break;
                }
                case 8: {
                    std::cout << "Enter symbol: ";
                    std::cin >> symbol;
                    std::cout << "Enter timestamp: ";
                    std::cin >> timestamp;
                    std::cout << "Enter open: ";
                    std::cin >> open;
                    std::cout << "Enter high: ";
                    std::cin >> high;
                    std::cout << "Enter low: ";
                    std::cin >> low;
                    std::cout << "Enter close: ";
                    std::cin >> close;
                    std::cout << "Enter volume: ";
                    std::cin >> volume;
                    pqxx::work W(C);
                    addStockData(W, symbol, timestamp, open, high, low, close, volume);
                    break;
                }
                case 9: {
                    std::cout << "Enter symbol: ";
                    std::cin >> symbol;
                    pqxx::nontransaction N(C);
                    viewStockData(N, symbol);
                    break;
                }
                case 10: {
                    if (currentUserID == -1) {
                        std::cout << "Please log in first.\n";
                        break;
                    }
                    std::cout << "Enter to user ID: ";
                    std::cin >> toUserID;
                    pqxx::work W(C);
                    sendFriendRequest(W, currentUserID, toUserID);
                    break;
                }
                case 11: {
                    if (currentUserID == -1) {
                        std::cout << "Please log in first.\n";
                        break;
                    }
                    pqxx::nontransaction N(C);
                    viewFriendRequests(N, currentUserID);
                    break;
                }
                case 12: {
                    if (currentUserID == -1) {
                        std::cout << "Please log in first.\n";
                        break;
                    }
                    std::cout << "Enter from user ID: ";
                    std::cin >> fromUserID;
                    pqxx::work W(C);
                    acceptFriendRequest(W, fromUserID, currentUserID);
                    break;
                }
                case 13: {
                    if (currentUserID == -1) {
                        std::cout << "Please log in first.\n";
                        break;
                    }
                    std::cout << "Enter list name: ";
                    std::cin >> listName;
                    std::cout << "Enter review text: ";
                    std::cin.ignore();
                    std::getline(std::cin, text);
                    pqxx::work W(C);
                    addReview(W, currentUserID, listName, text);
                    break;
                }
                case 14: {
                    std::cout << "Enter list name: ";
                    std::cin >> listName;
                    pqxx::nontransaction N(C);
                    viewReviews(N, listName);
                    break;
                }
                case 0: {
                    C.close();
                    std::cout << "Disconnected from the database" << std::endl;
                    return 0;
                }
                default:
                    std::cout << "Invalid choice\n";
                    break;
            }
        }
    } catch (const std::exception &e) {
        std::cerr << e.what() << std::endl;
        return 1;
    }

    return 0;
}
