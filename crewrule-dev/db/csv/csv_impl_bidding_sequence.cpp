/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/1/9 15:21
 * @File:    csv_impl_bidding_sequence.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/
#include "csv_impl.h"
#include "CrewDB.h"

void biddingSequenceParser::init(vector<string> &headers) {}


static vector<string> biddingSequenceDefaultHeaders = {"bidGroupId", "bidId", "satisfactionSequence"};

vector<string> &biddingSequenceParser::getDefaultHeaders() {
    return biddingSequenceDefaultHeaders;
}

void *biddingSequenceParser::createInstance() {
    return new BiddingSequence();
}

void biddingSequenceParser::deleteInstance(void *obj) {
    delete (BiddingSequence *) obj;
}

string biddingSequenceParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    auto *ref = (BiddingSequence *) obj;
    for (auto & header : headers) {
        if (header == "bidGroupId") { ss << ref->groupId << "^"; }
        else if (header == "bidId") { ss << ref->bidId << "^"; }
        else if (header == "satisfactionSequence") { ss << ref->satisfactionSequence << "^"; }
        else { logUnkonwnField("BiddingSequence", header); }
    }
    return ss.str();
}

void biddingSequenceParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    auto *ref = (BiddingSequence *) obj;
    if (headers[index] == "bidGroupId") { ref->groupId = atoll(value); }
    else if (headers[index] == "bidId") { ref->bidId = atoll(value); }
    else if (headers[index] == "satisfactionSequence") { ref->satisfactionSequence = atoll(value); }
    else { logUnkonwnField("BiddingSequence", headers[index]); }
}