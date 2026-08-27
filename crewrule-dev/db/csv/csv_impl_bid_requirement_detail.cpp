/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/1/9 14:56
 * @File:    csv_impl_bid_requirement_detail.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#include "csv_impl.h"
#include "CrewDB.h"

void bidRequirementDetailParser::init(vector<string> &headers) {}


static vector<string> bidRequirementDetailDefaultHeaders = {"bidRequirementId", "infoType", "infoValue"};

vector<string> &bidRequirementDetailParser::getDefaultHeaders() {
    return bidRequirementDetailDefaultHeaders;
}

void *bidRequirementDetailParser::createInstance() {
    return new BidRequirementDetail();
}

void bidRequirementDetailParser::deleteInstance(void *obj) {
    delete (BidRequirementDetail *) obj;
}

string bidRequirementDetailParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    auto *ref = (BidRequirementDetail *) obj;
    for (auto & header : headers) {
        if (header == "bidRequirementId") { ss << ref->bidRequirementId << "^"; }
        else if (header == "infoType") { ss << ref->infoType << "^"; }
        else if (header == "infoValue") { ss << ref->infoValue << "^"; }
        else { logUnkonwnField("BidRequirementDetail", header); }
    }
    return ss.str();
}

void bidRequirementDetailParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    auto *ref = (BidRequirementDetail *) obj;
    if (headers[index] == "bidRequirementId") { ref->bidRequirementId = atoll(value); }
    else if (headers[index] == "infoValue") { ref->infoValue = value; }
    else if (headers[index] == "infoType") { ref->infoType = value; }
    else { logUnkonwnField("BidRequirementDetail", headers[index]); }
}