#include "SchDutyUtils.h"

#undef NDEBUG
#include <cassert>
#include <algorithm>
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"
#include "TimeUtils.h"

int SchDutyUtils::GetScheduleRestMinutes(time_t& schRestStartTimeUtc, const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData) {

	if (nextDuty == nullptr) {
		int dropoff = currDuty->getMinDropoff();
		schRestStartTimeUtc = currDuty->getEndTimeUtcSch() + (time_t)dropoff * 60;
		return currDuty->getMinRest();
	}

	string isRound = "N";
	auto it = dbData->systemParamMap.find("CALC_REST_ROUND");
	if (it != dbData->systemParamMap.end()) {
		isRound = it->second;
	}

	//if (duties[i]->getPairingId() == 27051395)
	//	printf("");
	int	pickup = nextDuty->getMinPickup();
	int dropoff = currDuty->getMinDropoff();

	time_t restStart = currDuty->getEndTimeUtcSch();
	time_t restEnd = nextDuty->getStartTimeUtcSch();
	//cout << utcToUtcString(restStart) << endl;
	//cout << utcToUtcString(restEnd) << endl;
	if (isRound == "Y")
	{
		restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
		restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
	}

	int schRest = static_cast<int>(restEnd - restStart) / 60;

	schRest -= (dropoff + pickup);
	schRestStartTimeUtc = restStart + dropoff * 60;
	return schRest;
}

int SchDutyUtils::GetScheduleRestMinutesIncludePickupAndDropoff(time_t& schRestStartTimeUtc, const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData) {

	if (nextDuty == nullptr) {
		int dropoff = currDuty->getMinDropoff();
		schRestStartTimeUtc = currDuty->getEndTimeUtcSch() + (time_t)dropoff * 60;
		return currDuty->getMinRest();
	}

	string isRound = "N";
	auto it = dbData->systemParamMap.find("CALC_REST_ROUND");
	if (it != dbData->systemParamMap.end()) {
		isRound = it->second;
	}

	//if (duties[i]->getPairingId() == 27051395)
	//	printf("");
	int	pickup = nextDuty->getMinPickup();
	int dropoff = currDuty->getMinDropoff();

	time_t restStart = currDuty->getEndTimeUtcSch();
	time_t restEnd = nextDuty->getStartTimeUtcSch();
	//cout << utcToUtcString(restStart) << endl;
	//cout << utcToUtcString(restEnd) << endl;
	if (isRound == "Y")
	{
		restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
		restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
	}

	int schRest = static_cast<int>(restEnd - restStart) / 60;

	schRestStartTimeUtc = restStart;
	return schRest;
}

int SchDutyUtils::GetScheduleRestMinutesIncludePickupAndDropoff(const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData) {
	time_t schRestStartTimeUtc = 0;
	return GetScheduleRestMinutesIncludePickupAndDropoff(schRestStartTimeUtc, currDuty, nextDuty, dbData);
}


int SchDutyUtils::GetScheduleRestMinutes(const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData) {
	time_t schRestStartTimeUtc = 0;
	return GetScheduleRestMinutes(schRestStartTimeUtc, currDuty, nextDuty, dbData);
}

int SchDutyUtils::GetScheduleRestMinutes(time_t& schRestStartTimeUtc, const Duty* currDuty, const ROSTER* nextRoster, const SharedPtr<CrewDataContext>& dbData) {
	if (nextRoster == nullptr) {
		return currDuty->getMinRest();
	}

	string isRound = "N";
	auto it = dbData->systemParamMap.find("CALC_REST_ROUND");
	if (it != dbData->systemParamMap.end()) {
		isRound = it->second;
	}

	int dropoff = currDuty->getMinDropoff();

	time_t restStart = currDuty->getEndTimeUtcAct();
	time_t restEnd = nextRoster->getStartTimeUtcAct();
	//cout << utcToUtcString(restStart) << endl;
	//cout << utcToUtcString(restEnd) << endl;
	if (isRound == "Y")
	{
		restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
		restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
	}

	int schRest = static_cast<int>(restEnd - restStart) / 60;

	schRest -= (dropoff);
	schRestStartTimeUtc = restStart + dropoff;
	return schRest;
}

int SchDutyUtils::GetScheduleRestMinutes(const Duty* currDuty, const ROSTER* nextRoster, const SharedPtr<CrewDataContext>& dbData) {
	time_t schRestStartTimeUtc = 0;
	return GetScheduleRestMinutes(schRestStartTimeUtc, currDuty, nextRoster, dbData);
}

