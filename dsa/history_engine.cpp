#include <iostream>
#include <string>
using namespace std;


// ======================================
// LINKED LIST NODE
// ======================================

struct HistoryNode {

    string status;
    string timestamp;
    string description;

    HistoryNode* next;

    HistoryNode(
        string s,
        string t,
        string d
    ) {

        status = s;
        timestamp = t;
        description = d;

        next = nullptr;
    }
};


// ======================================
// LINKED LIST CLASS
// ======================================

class HistoryLinkedList {

private:

    HistoryNode* head;
    HistoryNode* tail;


public:

    HistoryLinkedList() {

        head = nullptr;
        tail = nullptr;
    }


    // ==================================
    // ADD HISTORY NODE
    // ==================================

    void addHistory(
        string status,
        string timestamp,
        string description
    ) {

        HistoryNode* newNode =
            new HistoryNode(
                status,
                timestamp,
                description
            );


        if (head == nullptr) {

            head = newNode;
            tail = newNode;

        } else {

            tail->next = newNode;
            tail = newNode;

        }

    }


    // ==================================
    // DISPLAY LINKED LIST
    // ==================================

    void displayHistory() {

        HistoryNode* current =
            head;


        while (
            current != nullptr
        ) {

            cout
                << current->status
                << "|"
                << current->timestamp
                << "|"
                << current->description
                << endl;


            current =
                current->next;
        }

    }


    // ==================================
    // DESTRUCTOR
    // ==================================

    ~HistoryLinkedList() {

        HistoryNode* current =
            head;


        while (
            current != nullptr
        ) {

            HistoryNode* nextNode =
                current->next;


            delete current;


            current =
                nextNode;
        }

    }

};


// ======================================
// MAIN
// ======================================

int main() {

    HistoryLinkedList history;


    string line;


    // Input format:
    //
    // status|timestamp|description
    //
    // One history entry per line.


    while (
        getline(cin, line)
    ) {

        if (
            line.empty()
        ) {

            continue;
        }


        size_t firstSeparator =
            line.find('|');


        size_t secondSeparator =
            line.find(
                '|',
                firstSeparator + 1
            );


        if (
            firstSeparator ==
                string::npos ||
            secondSeparator ==
                string::npos
        ) {

            continue;
        }


        string status =
            line.substr(
                0,
                firstSeparator
            );


        string timestamp =
            line.substr(
                firstSeparator + 1,
                secondSeparator -
                firstSeparator -
                1
            );


        string description =
            line.substr(
                secondSeparator + 1
            );


        history.addHistory(
            status,
            timestamp,
            description
        );

    }


    history.displayHistory();


    return 0;
}