/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/1/9 10:56
 * @File:    csv_impl_bid_requirement.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/

#include "csv_impl.h"
#include "CrewDB.h"
#include "UtilFunc.h"

void bidRequirementParser::init(vector<string> &headers) {}


static vector<string> bidRequirementDefaultHeaders = {"id", "bidId", "type", "startTime", "endTime",
                                                      "isPreassignmentCount"};

vector<string> &bidRequirementParser::getDefaultHeaders() {
    return bidRequirementDefaultHeaders;
}

void *bidRequirementParser::createInstance() {
    return new BidRequirement();
}

void bidRequirementParser::deleteInstance(void *obj) {
    delete (BidRequirement *) obj;
}

string bidRequirementParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    auto *ref = (BidRequirement *) obj;
    for (auto & header : headers) {
        if (header == "id") { ss << ref->id << "^"; }
        else if (header == "bidId") { ss << ref->bidId << "^"; }
        else if (header == "type") { ss << (char) ref->type << "^"; }
        else if (header == "startTime") { ss << utcToUtcDtString(ref->startTimeUtc) << "^"; }
        else if (header == "endTime") { ss << utcToUtcDtString(ref->endTimeUtc) << "^"; }
        else if (header == "isPreassignmentCount") { ss << ref->isPreAssignmentCount << "^"; }
        else { logUnkonwnField("BidRequirement", header); }
    }
    return ss.str();
}

void bidRequirementParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    auto *ref = (BidRequirement *) obj;
    if (headers[index] == "id") { ref->id = atoll(value); }
    else if (headers[index] == "bidId") { ref->bidId = atoll(value); }
    else if (headers[index] == "startTime") { ref->startTimeUtc = utcStrToUtc(value); }
    else if (headers[index] == "endTime") { ref->endTimeUtc = utcStrToUtc(value); }
    else if (headers[index] == "type") {
        if (BidRequirement::TypeMap.find(value) != BidRequirement::TypeMap.end()) {
            ref->type = BidRequirement::TypeMap.at(value);
        }
    }
    else if (headers[index] == "isPreassignmentCount") {
        ref->isPreAssignmentCount = (0 == memcmp(value, "Y", 1) ? true : false);
    }
    else { logUnkonwnField("BidRequirement", headers[index]); }
}
