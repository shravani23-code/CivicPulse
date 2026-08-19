#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>

using namespace std;


// ==========================================
// Complaint
// ==========================================

struct Complaint {

    string id;
    string title;
    string category;
    string severity;

    int priority;
};


// ==========================================
// Priority Queue - Max Heap
// ==========================================

class PriorityQueue {

private:

    vector<Complaint> heap;


    void heapifyUp(int index) {

        while (index > 0) {

            int parent = (index - 1) / 2;

            if (
                heap[parent].priority >=
                heap[index].priority
            ) {
                break;
            }

            swap(
                heap[parent],
                heap[index]
            );

            index = parent;
        }
    }


    void heapifyDown(int index) {

        int size = heap.size();

        while (true) {

            int left = 2 * index + 1;
            int right = 2 * index + 2;

            int largest = index;


            if (
                left < size &&
                heap[left].priority >
                heap[largest].priority
            ) {
                largest = left;
            }


            if (
                right < size &&
                heap[right].priority >
                heap[largest].priority
            ) {
                largest = right;
            }


            if (largest == index) {
                break;
            }


            swap(
                heap[index],
                heap[largest]
            );

            index = largest;
        }
    }


public:

    void push(Complaint complaint) {

        heap.push_back(complaint);

        heapifyUp(
            heap.size() - 1
        );
    }


    Complaint top() {

        return heap[0];
    }


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


    bool empty() {

        return heap.empty();
    }
};


// ==========================================
// Calculate Priority
// ==========================================

int calculatePriority(string severity) {

    if (severity == "Critical") {
        return 40;
    }

    if (severity == "High") {
        return 30;
    }

    if (severity == "Medium") {
        return 20;
    }

    return 10;
}


// ==========================================
// MAIN
// ==========================================

int main() {

    PriorityQueue queue;

    string line;


    /*
       Node.js will send data like:

       CP123|Large pothole|Road|High

       CP456|Garbage overflow|Garbage|Critical
    */


    while (getline(cin, line)) {

        if (line.empty()) {
            continue;
        }


        stringstream ss(line);

        Complaint complaint;


        getline(ss, complaint.id, '|');

        getline(ss, complaint.title, '|');

        getline(ss, complaint.category, '|');

        getline(ss, complaint.severity, '|');


        complaint.priority =
            calculatePriority(
                complaint.severity
            );


        queue.push(complaint);
    }


    // ======================================
    // Return complaints in priority order
    // ======================================

    while (!queue.empty()) {

        Complaint complaint =
            queue.top();


        cout
            << complaint.id
            << "|"
            << complaint.title
            << "|"
            << complaint.category
            << "|"
            << complaint.severity
            << "|"
            << complaint.priority
            << endl;


        queue.pop();
    }


    return 0;
}