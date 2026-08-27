/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/4/10 17:08
 * @File:    csv_impl_qualification.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/
#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void qualificationParser::init(vector<string>& headers) {}

static vector<string> qualificationDefaultHeaders = { "id", "qualification", "division", "negativeSlippage", "positiveSlippage", "baseMonthFlag", "negativeSlippageUnit", "positiveSlippageUnit" };
vector<string>& qualificationParser::getDefaultHeaders() {
	return qualificationDefaultHeaders;
}

void* qualificationParser::createInstance() {
	return new QUALIFICATION();
}

void qualificationParser::deleteInstance(void* obj) {
	delete (QUALIFICATION*)obj;
}

string qualificationParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	QUALIFICATION * ref = (QUALIFICATION *)obj;
	//"id", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "qualification") { ss << ref->qualification << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "negativeSlippage") { ss << ref->negativeSlippage << "^"; }
		else if (headers[i] == "positiveSlippage") { ss << ref->positiveSlippage << "^"; }
		else if (headers[i] == "baseMonthFlag") { ss << ref->baseMonthFlag << "^"; }
		else if (headers[i] == "negativeSlippageUnit") { ss << ref->negativeSlippageUnit << "^"; }
		else if (headers[i] == "positiveSlippageUnit") { ss << ref->positiveSlippageUnit << "^"; }
		else { logUnkonwnField("qualification", headers[i]); }
	}
	return ss.str();
}

void qualificationParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	QUALIFICATION * ref = (QUALIFICATION *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "qualification") { ref->qualification = value; }
	else if (headers[index] == "division") { ref->division = value; }
    else if (headers[index] == "negativeSlippage") { ref->negativeSlippage = atoi(value); }
    else if (headers[index] == "positiveSlippage") { ref->positiveSlippage = atoi(value); }
    else if (headers[index] == "baseMonthFlag") { ref->baseMonthFlag = atoi(value); }
    else if (headers[index] == "negativeSlippageUnit") { ref->negativeSlippageUnit = value; }
    else if (headers[index] == "positiveSlippageUnit") { ref->positiveSlippageUnit = value; }
	else { logUnkonwnField("qualification", headers[index]); }
}

