#include <iostream>
#include <vector>
#include <string>

using namespace std;

struct Complaint {
    string id;
    string title;
    string category;
    int priority;
};

class PriorityQueue {

private:

    vector<Complaint> heap;


    // Move a complaint upward
    void heapifyUp(int index) {

        while (index > 0) {

            int parent = (index - 1) / 2;

            if (heap[parent].priority >= heap[index].priority) {
                break;
            }

            swap(heap[parent], heap[index]);

            index = parent;
        }
    }


    // Move a complaint downward
    void heapifyDown(int index) {

        int size = heap.size();

        while (true) {

            int left = 2 * index + 1;
            int right = 2 * index + 2;

            int largest = index;


            if (
                left < size &&
                heap[left].priority > heap[largest].priority
            ) {
                largest = left;
            }


            if (
                right < size &&
                heap[right].priority > heap[largest].priority
            ) {
                largest = right;
            }


            if (largest == index) {
                break;
            }


            swap(heap[index], heap[largest]);

            index = largest;
        }
    }


public:

    // Add complaint
    void push(Complaint complaint) {

        heap.push_back(complaint);

        heapifyUp(heap.size() - 1);
    }


    // Get highest priority complaint
    Complaint top() {

        if (heap.empty()) {

            return {
                "",
                "",
                "",
                -1
            };
        }

        return heap[0];
    }


    // Remove highest priority complaint
    void pop() {

        if (heap.empty()) {
            return;
        }


        heap[0] = heap.back();

        heap.pop_back();


        if (!heap.empty()) {
            heapifyDown(0);
        }
    }


    // Check if empty
    bool empty() {

        return heap.empty();
    }
};


// Convert severity into priority score

int calculatePriority(
    string severity,
    int ageScore,
    int repeatScore
) {

    int severityScore = 0;

    if (severity == "Critical") {
        severityScore = 40;
    }
    else if (severity == "High") {
        severityScore = 30;
    }
    else if (severity == "Medium") {
        severityScore = 20;
    }
    else {
        severityScore = 10;
    }

    return severityScore + ageScore + repeatScore;
}


int main() {

    PriorityQueue complaints;


    Complaint c1 = {
    "CP1001",
    "Broken streetlight",
    "Streetlight",
    calculatePriority("Medium", 5, 2)
};

Complaint c2 = {
    "CP1002",
    "Major pothole",
    "Road",
    calculatePriority("High", 3, 5)
};

Complaint c3 = {
    "CP1003",
    "Gas leakage",
    "Emergency",
    calculatePriority("Critical", 1, 3)
};

Complaint c4 = {
    "CP1004",
    "Garbage collection issue",
    "Garbage",
    calculatePriority("Low", 8, 4)
};


    complaints.push(c1);
    complaints.push(c2);
    complaints.push(c3);
    complaints.push(c4);


    cout << "CivicPulse Complaint Priority Queue\n";
    cout << "-----------------------------------\n";


    while (!complaints.empty()) {

        Complaint highest = complaints.top();


        cout << highest.id
             << " | "
             << highest.title
             << " | Priority: "
             << highest.priority
             << endl;


        complaints.pop();
    }


    return 0;
}