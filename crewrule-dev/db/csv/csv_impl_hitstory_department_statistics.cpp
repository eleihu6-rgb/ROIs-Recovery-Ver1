#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void historyDepartmentStatisticsParser::init(vector<string>& headers) {}


static vector<string> historyDepartmentStatisticsDefaultHeaders = { "id", "branchCode", "month","tagCategoryId","quantity", "lastModified", "modifiedBy" };
vector<string>& historyDepartmentStatisticsParser::getDefaultHeaders() {
	return historyDepartmentStatisticsDefaultHeaders;
}

void* historyDepartmentStatisticsParser::createInstance() {
	return new HISTORY_DEPARTMENT_STATISTICS();
}

void historyDepartmentStatisticsParser::deleteInstance(void* obj) {
	delete (HISTORY_DEPARTMENT_STATISTICS*)obj;
}


string historyDepartmentStatisticsParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	HISTORY_DEPARTMENT_STATISTICS * ref = (HISTORY_DEPARTMENT_STATISTICS *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "branchCode") { ss << ref->branchCode << "^"; }
		else if (headers[i] == "month ") { ss << ref->month << "^"; }
		else if (headers[i] == "tagCategoryId ") { ss << ref->tagCategoryId << "^"; }
		else if (headers[i] == "tagCategoryCode ") { ss << ref->tagCategoryCode << "^"; }
		else if (headers[i] == "quantity ") { ss << ref->quantity << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("hitstory_department_statistics", headers[i]); }
	}
	return ss.str();

}


void historyDepartmentStatisticsParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	HISTORY_DEPARTMENT_STATISTICS * ref = (HISTORY_DEPARTMENT_STATISTICS *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "branchCode") { ref->branchCode = value; }
	else if (headers[index] == "month") { ref->month = value; }
	else if (headers[index] == "tagCategoryId") { ref->tagCategoryId = atoll(value); }
	else if (headers[index] == "tagCategoryCode") { ref->tagCategoryCode = value; }
	else if (headers[index] == "tagCategoryName") {}
	else if (headers[index] == "quantity") { ref->quantity = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("hitstory_department_statistics", headers[index]); }

}