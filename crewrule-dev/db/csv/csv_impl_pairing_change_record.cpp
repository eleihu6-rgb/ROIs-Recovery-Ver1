/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/11/20 11:24
 * @File:    csv_impl_pairing_change_record.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/

#include <sstream>
#include "UtilFunc.h"
#include "DBTrainingPairingChangeRecord.h"
#include "csv_impl.h"

void pairingChangeRecordParser::init(vector<string> &headers) {}


static vector<string> rankDefaultHeaders = {"id", "originalPairingId", "createdPairingId"};

vector<string> &pairingChangeRecordParser::getDefaultHeaders() {
    return rankDefaultHeaders;
}

void *pairingChangeRecordParser::createInstance() {
    return new DBTrainingPairingChangeRecord();
}

void pairingChangeRecordParser::deleteInstance(void *obj) {
    delete (DBTrainingPairingChangeRecord *) obj;
}

string pairingChangeRecordParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    DBTrainingPairingChangeRecord *ref = (DBTrainingPairingChangeRecord *) obj;
    for (std::size_t i = 0; i < headers.size(); i++) {
        if (headers[i] == "id") { ss << ref->GetRecordId() << "^"; }
        else if (headers[i] == "originalPairingId") { ss << ref->GetOriginalPairingId() << "^"; }
        else if (headers[i] == "createdPairingId") { ss << ref->GetCreatedPairingId() << "^"; }
        else { logUnkonwnField("DBTrainingPairingChangeRecord", headers[i]); }
    }
    return ss.str();
}

void pairingChangeRecordParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    DBTrainingPairingChangeRecord *ref = (DBTrainingPairingChangeRecord *) obj;
    if (headers[index] == "id") { ref->SetRecordId(atoll(value)); }
    else if (headers[index] == "originalPairingId") { ref->SetOriginalPairingId(atoll(value)); }
    else if (headers[index] == "createdPairingId") { ref->SetCreatedPairingId(atoll(value)); }
    else { logUnkonwnField("DBTrainingPairingChangeRecord", headers[index]); }
}


