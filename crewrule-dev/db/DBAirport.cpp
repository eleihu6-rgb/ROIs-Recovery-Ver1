#include <stdio.h>
#include <vector>
#include <unordered_map>
#include <time.h>
#include "Duty.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"

using namespace std;

DBAirport::DBAirport() {
	utcOffsetMinutes = 0;
	longitude = 0;
	latitude = 0;
	memset(plateauType, 0, sizeof(plateauType));
	memset(airport, 0, sizeof(airport));
	memset(airportName, 0, sizeof(airportName));
	memset(airportNativeName, 0, sizeof(airportNativeName));
	memset(dstGrp, 0, sizeof(dstGrp));
	memset(zoneId, 0, sizeof(zoneId));
	memset(isInternalBase, 0, sizeof(isInternalBase));
	memset(isCrossContinental, 0, sizeof(isCrossContinental));
	memset(airportICAO, 0, sizeof(airportICAO));
	memset(airportABBR, 0, sizeof(airportABBR));
	memset(cityName, 0, sizeof(cityName));
	memset(cityNativeName, 0, sizeof(cityNativeName));
	memset(city, 0, sizeof(city));
	memset(country, 0, sizeof(country));
	memset(dir, 0, sizeof(dir));
}


//*********************************************************************
//将utc时间转为airport本地时间
//若失败，则 ctx->errorCode返回错误码
//*********************************************************************
time_t utcToAirportLoc(string& airport, time_t utc, unordered_map<string, int> &airportUtcOffsetMap, unordered_map<string, daylight_saving> &daylightSavingMap) {
	time_t    loc = 0;
	long    offsetSecond = 0;
	long    daylightSavSecond = 0;
	unordered_map<string, int>::iterator             itOffset;
	unordered_map<string, daylight_saving>::iterator itDaylight;
	//PairingDBContext ctx = { 0 };

	itOffset = airportUtcOffsetMap.find(airport);
	if (itOffset != airportUtcOffsetMap.end()) {
		offsetSecond = itOffset->second * 60; //minutes -> seconds
	}

	itDaylight = daylightSavingMap.find(airport);
	if (itDaylight != daylightSavingMap.end()) {
		for (std::size_t i = 0; i < itDaylight->second.list.size(); i++) {
			daylight_range * range = &(itDaylight->second.list[i]);
			if (range->daylight_start <= utc &&
				range->daylight_end >= utc) {
				daylightSavSecond = range->change_min * 60; //minutes -> second
			}
		}
	}

	loc = utc + offsetSecond + daylightSavSecond;

	return loc;
}
