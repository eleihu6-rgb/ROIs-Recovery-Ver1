#pragma once

#include <sstream>
#include "csv_impl.h"
#include "Voyage.h"
#include "UtilFunc.h"
//voyageDetailParser
using namespace std;

void voyageDetailParser::init(vector<string>& headers) {}


static vector<string> voyageDetailDefaultHeaders = { "id", "fltId", "taxiOutTime", "takeoffTime", "landingTime", "taxiInTime", "airHours", "grndHours", "nightHours", "totlHours", "oldFuel", "newFuel", "leftFuel", "contractHour", "contractMemo",
"takeOffTimes", "touchDownTimes", "takeOffOpuRole", "touchDownOpuRole"};
vector<string>& voyageDetailParser::getDefaultHeaders() {
	return voyageDetailDefaultHeaders;
}

void* voyageDetailParser::createInstance() {
	return new VoyageDetail();
}

void voyageDetailParser::deleteInstance(void* obj) {
	delete (VoyageDetail*)obj;
}


string voyageDetailParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	VoyageDetail * ref = (VoyageDetail *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getId() << "^"; }
		else if (headers[i] == "fltId") { ss << ref->getFltId() << "^"; }
		else if (headers[i] == "crewId") { ss << ref->getCrewId() << "^"; }
		else if (headers[i] == "blockHrs") { ss << ref->getBlockHrs() << "^"; }
		else if (headers[i] == "expBlockHrs") { ss << ref->getExpBlockHrs() << "^"; }
		else if (headers[i] == "leftBlockHrs") { ss << ref->getLeftBlockHrs() << "^"; }
		else if (headers[i] == "leftUps") { ss << ref->getLeftUps() << "^"; }
		else if (headers[i] == "leftDowns") { ss << ref->getLeftDowns() << "^"; }
		else if (headers[i] == "leftNightHrs") { ss << ref->getLeftNightHrs() << "^"; }
		else if (headers[i] == "leftTeachHrs") { ss << ref->getLeftTeachHrs() << "^"; }
		else if (headers[i] == "rightBlockHrs") { ss << ref->getRightBlockHrs() << "^"; }
		else if (headers[i] == "rightUps") { ss << ref->getRightUps() << "^"; }
		else if (headers[i] == "rightDowns") { ss << ref->getRightDowns() << "^"; }
		else if (headers[i] == "rightNightHrs") { ss << ref->getRightNightHrs() << "^"; }
		else if (headers[i] == "rightTeachHrs") { ss << ref->getRightTeachHrs() << "^"; }
		else if (headers[i] == "expUpdowns") { ss << ref->getExpUpdowns() << "^"; }
		else if (headers[i] == "ilsType") { ss << ref->getIlsType() << "^"; }
		//else { logUnkonwnField("voyageDetail", headers[i]); }
	}
	return ss.str();

}


void voyageDetailParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	VoyageDetail * ref = (VoyageDetail *)obj;
	if (headers[index] == "id") { ref->setId(atoll(value)); }
	else if (headers[index] == "fltId") { ref->setFltId(atoll(value)); } //int64
	else if (headers[index] == "crewId") { ref->setCrewId(value); }
	else if (headers[index] == "blockHrs") { ref->setBlockHrs(atoi(value)); }
	else if (headers[index] == "expBlockHrs") { ref->setExpBlockHrs(atoi(value)); }
	else if (headers[index] == "leftBlockHrs") { ref->setLeftBlockHrs(atoi(value)); }
	else if (headers[index] == "leftUps") { ref->setLeftUps(atoi(value)); }
	else if (headers[index] == "leftDowns") { ref->setLeftDowns(atoi(value)); }
	else if (headers[index] == "leftNightHrs") { ref->setLeftNightHrs(atoi(value)); }
	else if (headers[index] == "leftTeachHrs") { ref->setLeftTeachHrs(atoi(value)); }
	else if (headers[index] == "rightBlockHrs") { ref->setRightBlockHrs(atoi(value)); }
	else if (headers[index] == "rightUps") { ref->setRightUps(atoi(value)); }
	else if (headers[index] == "rightDowns") { ref->setRightDowns(atoi(value)); }
	else if (headers[index] == "rightNightHrs") { ref->setRightNightHrs(atoi(value)); }
	else if (headers[index] == "rightTeachHrs") { ref->setRightTeachHrs(atoi(value)); }
	else if (headers[index] == "expUpdowns") { ref->setExpUpdowns(atoi(value)); }
	else if (headers[index] == "ilsType") { ref->setIlsType(value); }
	else if (headers[index] == "totalNightTime") {}
	else if (headers[index] == "instrumentHours") {}
	else if (headers[index] == "pilotRole") {}
	else if (headers[index] == "landingType") {}
	else if (headers[index] == "firstName") {}
	else if (headers[index] == "middleName") {}
	else if (headers[index] == "lastName") {}
	else if (headers[index] == "takeOffTimes") { ref->setTakeOffTimes(atoi(value)); }
	else if (headers[index] == "touchDownTimes") { ref->setTouchDownTime(atoi(value)); }
	else if (headers[index] == "takeOffOpuRole") { ref->setTakeOffOpuRole(value); }
	else if (headers[index] == "touchDownOpuRole") { ref->setTouchDownOpuRole(value); }
	//else { logUnkonwnField("voyageDetail", headers[index]); }

}