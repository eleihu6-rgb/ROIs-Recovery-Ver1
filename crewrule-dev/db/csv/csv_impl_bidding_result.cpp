/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/1/9 15:57
 * @File:    csv_impl_bidding_result.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/
#include "csv_impl.h"
#include "CrewDB.h"

void biddingResultParser::init(vector<string> &headers) {}


static vector<string> biddingResultDefaultHeaders = {"bidId", "satisfied"};

vector<string> &biddingResultParser::getDefaultHeaders() {
    return biddingResultDefaultHeaders;
}

void *biddingResultParser::createInstance() {
    return new BiddingResult();
}

void biddingResultParser::deleteInstance(void *obj) {
    delete (BiddingResult *) obj;
}

string biddingResultParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    auto *ref = (BiddingResult *) obj;
    for (auto & header : headers) {
        if (header == "bidId") { ss << ref->bidId << "^"; }
        else if (header == "satisfied") { ss << (ref->satisfied ? "Y" : "N") << "^"; }
        else { logUnkonwnField("BiddingResult", header); }
    }
    return ss.str();
}

void biddingResultParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    auto *ref = (BiddingResult *) obj;
    if (headers[index] == "bidId") { ref->bidId = atoll(value); }
    else if (headers[index] == "satisfied") { ref->satisfied = (0 == memcmp(value, "Y", 1) ? true : false); }
    else { logUnkonwnField("BiddingResult", headers[index]); }
}