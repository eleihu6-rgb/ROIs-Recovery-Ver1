/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/3/3 15:17
 * @File:    csv_impl_bidding_sequence_group.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/
#include "csv_impl.h"
#include "CrewDB.h"

void biddingSequenceGroupParser::init(vector<string> &headers) {}


static vector<string> biddingSequenceGroupDefaultHeaders = {"id", "forceSequence", "sequenceType", "bidSettingId", "maxApprovalTime"};

vector<string> &biddingSequenceGroupParser::getDefaultHeaders() {
    return biddingSequenceGroupDefaultHeaders;
}

void *biddingSequenceGroupParser::createInstance() {
    return new BiddingSequenceGroup();
}

void biddingSequenceGroupParser::deleteInstance(void *obj) {
    delete (BiddingSequenceGroup *) obj;
}

string biddingSequenceGroupParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    auto *ref = (BiddingSequenceGroup *) obj;
    for (auto & header : headers) {
        if (header == "id") { ss << ref->id << "^"; }
        else if (header == "forceSequence") { ss << (ref->forceSequence ? "Y" : "N") << "^"; }
        else if (header == "sequenceType") { ss << (char)ref->type << "^"; }
        else if (header == "bidSettingId") { ss << ref->bidSettingId << "^"; }
        else if (header == "maxApprovalTime") { ss << ref->maxApprovalTime << "^"; }
        else { logUnkonwnField("BiddingSequenceGroup", header); }
    }
    return ss.str();
}

void biddingSequenceGroupParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    auto *ref = (BiddingSequenceGroup *) obj;
    if (headers[index] == "id") { ref->id = atoll(value); }
    else if (headers[index] == "forceSequence") { ref->forceSequence = strcmp(value, "Y") == 0; }
    else if (headers[index] == "sequenceType") {
        if (BiddingSequenceGroup::TypeMap.find(value) != BiddingSequenceGroup::TypeMap.end()) {
            ref->type = BiddingSequenceGroup::TypeMap.at(value);
        }
    }
    else if (headers[index] == "bidSettingId") { ref->bidSettingId = atoll(value); }
    else if (headers[index] == "maxApprovalTime" && strcmp(value, "") != 0) {
        ref->maxApprovalTime = atoi(value);
    }
    else { logUnkonwnField("BiddingSequenceGroup", headers[index]); }
}