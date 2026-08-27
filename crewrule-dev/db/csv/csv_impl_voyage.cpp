#pragma once

#include <sstream>
#include "csv_impl.h"
#include "Voyage.h"
#include "UtilFunc.h"
//voyageParser
using namespace std;

void voyageParser::init(vector<string>& headers) {}


static vector<string> voyageDefaultHeaders = { "id", "fltId", "taxiOutTime", "takeoffTime", "landingTime", "taxiInTime",
"airHours", "grndHours", "nightHours", "totlHours", "oldFuel", "newFuel", "leftFuel", "contractHour", "contractMemo"
, "nightHours1", "nightHours2", "nightHours3", "salaryType", "dataStatus", "status"
,"approachWay", "remarks", "operHost", "weightFuel", "interfaceFltId", "auditRemarks", "voyageFrom", "reflyCount" ,"operIp"
,"distance","totalFuel","takeoffgrossweight","maxtogw","maxlandingweight","operatingairweight","industryload"
,"depPf","arvPf","depNight","arvNight","ensureFlag"};
vector<string>& voyageParser::getDefaultHeaders() {
	return voyageDefaultHeaders;
}

void* voyageParser::createInstance() {
	return new Voyage();
}

void voyageParser::deleteInstance(void* obj) {
	delete (Voyage*)obj;
}


string voyageParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Voyage * ref = (Voyage *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getId() << "^"; }
		else if (headers[i] == "fltId") { ss << ref->getFltId() << "^"; }
		else if (headers[i] == "taxiOutTime") { ss << utcToUtcTzString(ref->getTaxiOutTime()) << "^"; }
		else if (headers[i] == "takeoffTime") { ss << utcToUtcTzString(ref->getTakeoffTime()) << "^"; }
		else if (headers[i] == "landingTime") { ss << utcToUtcTzString(ref->getLandingTime()) << "^"; }
		else if (headers[i] == "taxiInTime") { ss << utcToUtcTzString(ref->getTaxiInTime()) << "^"; }
		else if (headers[i] == "airHours") { ss << ref->getAirHours() << "^"; }
		else if (headers[i] == "grndHours") { ss << ref->getGrndHours() << "^"; }
		else if (headers[i] == "nightHours") { ss << ref->getNightHours() << "^"; }
		else if (headers[i] == "totlHours") { ss << ref->getTotlHours() << "^"; }
		else if (headers[i] == "oldFuel") { ss << ref->getOldFuel() << "^"; }
		else if (headers[i] == "newFuel") { ss << ref->getNewFuel() << "^"; }
		else if (headers[i] == "leftFuel") { ss << ref->getLeftFuel() << "^"; }
		else if (headers[i] == "contractHour") { ss << ref->getContractHour() << "^"; }
		else if (headers[i] == "contractMemo") { ss << ref->getContractMemo() << "^"; }
		else if (headers[i] == "nightHours1") { ss << "^"; }
		else if (headers[i] == "nightHours2") { ss << "^"; }
		else if (headers[i] == "nightHours3") { ss << "^"; }
		else if (headers[i] == "salaryType") { ss << "^"; }
		else if (headers[i] == "dataStatus") { ss << "^"; }
		else if (headers[i] == "status") { ss << "^"; }
		else if (headers[i] == "approachWay") { ss << "^"; }
		else if (headers[i] == "remarks") { ss << "^"; }
		else if (headers[i] == "operHost") { ss << "^"; }
		else if (headers[i] == "weightFuel") { ss << "^"; }
		else if (headers[i] == "interfaceFltId") { ss << "^"; }
		else if (headers[i] == "auditRemarks") { ss << "^"; }
		else if (headers[i] == "voyageFrom") { ss << "^"; }
		else if (headers[i] == "reflyCount") { ss << "^"; }
		else if (headers[i] == "operIp") { ss << "^"; }
		else if (headers[i] == "distance") { ss << "^"; }
		else if (headers[i] == "totalFuel") { ss << "^"; }
		else if (headers[i] == "takeoffgrossweight") { ss << "^"; }
		else if (headers[i] == "maxtogw") { ss << "^"; }
		else if (headers[i] == "maxlandingweight") { ss << "^"; }
		else if (headers[i] == "operatingairweight") { ss << "^"; }
		else if (headers[i] == "industryload") { ss << "^"; }
		else if (headers[i] == "depPf") { ss << "^"; }
		else if (headers[i] == "arvPf") { ss << "^"; }
		else if (headers[i] == "depNight") { ss << "^"; }
		else if (headers[i] == "arvNight") { ss << "^"; }
		else if (headers[i] == "ensureFlag") { ss << "^"; }
		else {}
	}
	return ss.str();

}


void voyageParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Voyage * ref = (Voyage *)obj;
	if (headers[index] == "id") { ref->setId(atoll(value)); }
	else if (headers[index] == "fltId") { ref->setFltId(atoll(value)); }
	else if (headers[index] == "taxiOutTime") { ref->setTaxiOutTime(utcStrToUtc(value)); }
	else if (headers[index] == "takeoffTime") { ref->setTakeoffTime(utcStrToUtc(value)); }
	else if (headers[index] == "landingTime") { ref->setLandingTime(utcStrToUtc(value)); }
	else if (headers[index] == "taxiInTime") { ref->setTaxiInTime(utcStrToUtc(value)); }
	else if (headers[index] == "airHours") { ref->setAirHours(atoi(value)); }
	else if (headers[index] == "grndHours") { ref->setGrndHours(atoi(value)); }
	else if (headers[index] == "nightHours") { ref->setNightHours(atoi(value)); }
	else if (headers[index] == "totlHours") { ref->setTotlHours(atoi(value)); }
	else if (headers[index] == "oldFuel") { ref->setOldFuel(atoi(value)); }
	else if (headers[index] == "newFuel") { ref->setNewFuel(atoi(value)); }
	else if (headers[index] == "leftFuel") { ref->setLeftFuel(atoi(value)); }
	else if (headers[index] == "contractHour") { ref->setContractHour(atoi(value)); }
	else if (headers[index] == "contractMemo") { ref->setContractMemo(value); }
	else if (headers[index] == "nightHours1") {}
	else if (headers[index] == "nightHours2") {}
	else if (headers[index] == "nightHours3") {}
	else if (headers[index] == "salaryType") {}
	else if (headers[index] == "dataStatus") {}
	else if (headers[index] == "status") {}
	else if (headers[index] == "approachWay") {}
	else if (headers[index] == "remarks") {}
	else if (headers[index] == "operHost")  {}
	else if (headers[index] == "weightFuel") {}
	else if (headers[index] == "interfaceFltId") {}
	else if (headers[index] == "auditRemarks") {}
	else if (headers[index] == "voyageFrom") {}
	else if (headers[index] == "reflyCount") {}
	else if (headers[index] == "operIp") {}
	else if (headers[index] == "distance") {  }
	else if (headers[index] == "totalFuel") {  }
	else if (headers[index] == "takeoffgrossweight") {  }
	else if (headers[index] == "maxtogw") {  }
	else if (headers[index] == "maxlandingweight") {  }
	else if (headers[index] == "operatingairweight") {  }
	else if (headers[index] == "industryload") {  }
	else if (headers[index] == "depPf") {}
	else if (headers[index] == "arvPf") {}
	else if (headers[index] == "depNight") {}
	else if (headers[index] == "arvNight") {}
	else if (headers[index] == "ensureFlag") {}
	else if (headers[index] == "lastApproved") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "approvedBy") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "remark") {}
	else if (headers[index] == "orbitType") {}
	else if (headers[index] == "fltDt") {}
	else if (headers[index] == "fltNum") {}
	else if (headers[index] == "depArp") {}
	else if (headers[index] == "arvArp") {}
	else if (headers[index] == "newFuelVolume") {}
	else if (headers[index] == "newFuelDensity") {}
	else if (headers[index] == "takeoffWeight") {}
	else if (headers[index] == "hudType") {}
	else if (headers[index] == "cockpitCheckItem") {}
	else if (headers[index] == "actDepDtUtc") {}
	else if (headers[index] == "actArvDtUtc") {}
	else if (headers[index] == "externalId") {}
	else if (headers[index] == "depPF") {}
	else if (headers[index] == "arvPF") {}
	else if (headers[index] == "iapDep") {}
	else if (headers[index] == "iapArv") {}
	else if (headers[index] == "uploadAttachment") {}
	else if (headers[index] == "retrievalStatus") {}
	else if (headers[index] == "fltType") {}
	else if (headers[index] == "leftTakeOff") {}
	else if (headers[index] == "rightTakeOff") {}
	else if (headers[index] == "leftLanding") {}
	else if (headers[index] == "rightLanding") {}
	else if (headers[index] == "takeOffController") {}
	else if (headers[index] == "landingController") {}
	else if (headers[index] == "driveOnTime") {}
	else if (headers[index] == "driveOffTime") {}
	else if (headers[index] == "dutyId") {}
	else if (headers[index] == "taxiTime") {}
	else if (headers[index] == "burnFuel") {}
	else if (headers[index] == "passengerQty") {}
	else if (headers[index] == "isBaseTraining") { ref->setIsBaseTraining(atoi(value)); }
	else { logUnkonwnField("voyage", headers[index]); }

}