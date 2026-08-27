/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/1/9 16:05
 * @File:    csv_impl_bidding_result_detail.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/
#include "csv_impl.h"
#include "CrewDB.h"

void biddingResultDetailParser::init(vector<string> &headers) {}


static vector<string> biddingResultDetailDefaultHeaders = {"bidId", "relatedRoster", "relatedRosterGround"};

vector<string> &biddingResultDetailParser::getDefaultHeaders() {
    return biddingResultDetailDefaultHeaders;
}

void *biddingResultDetailParser::createInstance() {
    return new BiddingResultDetail();
}

void biddingResultDetailParser::deleteInstance(void *obj) {
    delete (BiddingResultDetail *) obj;
}

string biddingResultDetailParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    auto *ref = (BiddingResultDetail *) obj;
    for (auto & header : headers) {
        if (header == "bidId") { ss << ref->bidId << "^"; }
        else if (header == "relatedRoster") { ss << ref->relatedRosterId << "^"; }
        else if (header == "relatedRosterGround") { ss << ref->relatedRosterGroundId << "^"; }
        else { logUnkonwnField("BiddingResultDetail", header); }
    }
    return ss.str();
}

void biddingResultDetailParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    auto *ref = (BiddingResultDetail *) obj;
    if (headers[index] == "bidId") { ref->bidId = atoll(value); }
    else if (headers[index] == "relatedRoster") { ref->relatedRosterId = atoll(value); }
    else if (headers[index] == "relatedRosterGround") { ref->relatedRosterGroundId = atoll(value); }
    else { logUnkonwnField("BiddingResultDetail", headers[index]); }
}