//
// Created by haoli on 2025/1/9.
//
#include "csv_impl.h"
#include "CrewDB.h"

void bidParser::init(vector<string> &headers) {}


static vector<string> bidDefaultHeaders = {"id", "crewId", "points", "satisfactionCriteria",
                                           "satisfactionContribution"};

vector<string> &bidParser::getDefaultHeaders() {
    return bidDefaultHeaders;
}

void *bidParser::createInstance() {
    return new Bid();
}

void bidParser::deleteInstance(void *obj) {
    delete (Bid *) obj;
}

string bidParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    auto *ref = (Bid *) obj;
    for (auto & header : headers) {
        if (header == "id") { ss << ref->id << "^"; }
        else if (header == "crewId") { ss << ref->crewId << "^"; }
        else if (header == "points") { ss << ref->points << "^"; }
        else if (header == "satisfactionCriteria") { ss << (char) ref->satisfactionCriteria << "^"; }
        else if (header == "satisfactionContribution") { ss << ref->satisfactionContribution << "^"; }
        else { logUnkonwnField("Bid", header); }
    }
    return ss.str();
}

void bidParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    auto *ref = (Bid *) obj;
    if (headers[index] == "id") { ref->id = atoll(value); }
    else if (headers[index] == "crewId") { ref->crewId = value; }
    else if (headers[index] == "points") {
        auto pv = atof(value);
        if (pv > 0)
            ref->points = pv;
        else
            ref->points = 0.1;
    }
    else if (headers[index] == "satisfactionCriteria") {
        if (Bid::SatisfactionCriteriaMap.find(value) != Bid::SatisfactionCriteriaMap.end()) {
            ref->satisfactionCriteria = Bid::SatisfactionCriteriaMap.at(value);
        }
    }
    else if (headers[index] == "satisfactionContribution") { ref->satisfactionContribution = atoi(value); }
    else { logUnkonwnField("Bid", headers[index]); }
}