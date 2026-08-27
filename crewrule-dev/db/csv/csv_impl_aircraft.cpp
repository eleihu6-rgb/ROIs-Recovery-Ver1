#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void aircraftParser::init(vector<string>& headers) {}


static vector<string> aircraftDefaultHeaders = { "airline", "acReg", "acType", "acTypeSon", "crewAcType",
"dow", "dowL", "doi", "doiL", "flyDevice", "maxDepartWeight", "maxLandfallWeight", "maxNoOilWeight",
"startDate", "endDate", "seats", "isExistRest", "isCat2", "oew", "cog", "lastModified", "modifiedBy","id","filiale", "fdRestFacCnt", "ccRestFacCnt"};
vector<string>& aircraftParser::getDefaultHeaders() {
	return aircraftDefaultHeaders;
}

void* aircraftParser::createInstance() {
	return new DBAircraft();
}

void aircraftParser::deleteInstance(void* obj) {
	delete (DBAircraft*)obj;
}


string aircraftParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	DBAircraft * ref = (DBAircraft *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "acReg") { ss << ref->acReg << "^"; }
		else if (headers[i] == "acType") { ss << ref->acType << "^"; }
		else if (headers[i] == "acTypeSon") { ss << ref->acTypeSon << "^"; }
		else if (headers[i] == "crewAcType") { ss << ref->crewAcType << "^"; }
		else if (headers[i] == "cats") { ss << ref->cats << "^"; }
		else if (headers[i] == "rnp") { ss << ref->rnp << "^"; }
		else if (headers[i] == "dow") { ss << ref->dow << "^"; }
		else if (headers[i] == "dowL") { ss << ref->dowL << "^"; }
		else if (headers[i] == "doi") { ss << ref->doi << "^"; }
		else if (headers[i] == "doiL") { ss << ref->doiL << "^"; }
		else if (headers[i] == "flyDevice") { ss << ref->flyDevice << "^"; }
		else if (headers[i] == "maxDepartWeight") { ss << ref->maxDepartWeight << "^"; }
		else if (headers[i] == "maxLandfallWeight") { ss << ref->maxLandfallWeight << "^"; }
		else if (headers[i] == "maxNoOilWeight") { ss << ref->maxNoOilWeight << "^"; }
		else if (headers[i] == "startDate") { ss << ref->startDate << "^"; }
		else if (headers[i] == "endDate") { ss << ref->endDate << "^"; }
		else if (headers[i] == "seats") { ss << ref->seats << "^"; }
		else if (headers[i] == "isExistRest") { ss << ref->isExistRest << "^"; }
		else if (headers[i] == "isCat2") { ss << ref->isCat2 << "^"; }
		else if (headers[i] == "restfacility") { ss << ref->restFacility << "^"; }
		else if (headers[i] == "ccRestfacility") { ss << ref->ccRestFacility << "^"; }
		else if (headers[i] == "oew") { ss << "^"; }
		else if (headers[i] == "cog") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else { logUnkonwnField("aircraft", headers[i]); }
	}
	return ss.str();

}


void aircraftParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	DBAircraft * ref = (DBAircraft *)obj;
	if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "acReg") { ref->acReg = value; }
	else if (headers[index] == "acType") { ref->acType = value; }//Ver2.0
	else if (headers[index] == "fleet") { ref->acType = value; }//Ver3.0
	else if (headers[index] == "fleetGrp") {  } // Ver3.0
	else if (headers[index] == "acTypeSon") { ref->acTypeSon = value; }
	else if (headers[index] == "crewAcType") { ref->crewAcType = value; }
	else if (headers[index] == "cats") { ref->cats = value; }
	else if (headers[index] == "rnp") { ref->rnp = value; }
	else if (headers[index] == "dow") { ref->dow = atoi(value); }
	else if (headers[index] == "dowL") { ref->dowL = atoi(value); }
	else if (headers[index] == "doi") { ref->doi = (float)atof(value); }
	else if (headers[index] == "doiL") { ref->doiL = (float)atof(value); }
	else if (headers[index] == "flyDevice") { ref->flyDevice = value; }
	else if (headers[index] == "maxDepartWeight") { ref->maxDepartWeight = atoi(value); }
	else if (headers[index] == "maxLandfallWeight") { ref->maxLandfallWeight = atoi(value); }
	else if (headers[index] == "maxNoOilWeight") { ref->maxNoOilWeight = atoi(value); }
	else if (headers[index] == "startDate") { ref->startDate = utcStrToUtc(value); }
	else if (headers[index] == "endDate") { ref->endDate = utcStrToUtc(value); }
	else if (headers[index] == "seats") { ref->seats = atoi(value); }
	else if (headers[index] == "isExistRest") { ref->isExistRest = (0 == strncmp("true", value, 4)); }
	else if (headers[index] == "isCat2") { ref->isCat2 = (0 == strncmp("true", value, 4)); }
	else if (headers[index] == "restfacility") { ref->restFacility = atoi(value); }
	else if (headers[index] == "ccRestfacility") { ref->ccRestFacility = atoi(value); }
	else if (headers[index] == "fdRestFacCnt") { ref->fdRestFacCnt = atoi(value); }
	else if (headers[index] == "ccRestFacCnt") { ref->ccRestFacCnt = atoi(value); }
	else if (headers[index] == "oew") { }
	else if (headers[index] == "cog") { }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else if (headers[index] == "filiale") {}
	else if (headers[index] == "maxSlideWeight") {}
	else if (headers[index] == "longAcType") {}
	else if (headers[index] == "subFleet") {}
	else { logUnkonwnField("aircraft", headers[index]); }

}