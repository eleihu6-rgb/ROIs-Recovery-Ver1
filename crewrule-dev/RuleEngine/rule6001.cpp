#include "algorithm"
#include <math.h>
#include <ctime>
#include "RuleEngine.h"
#include "RDOHelper/Helper6001.h"
#include "Utility.h"
#include "UtilFunc.h"
#include "utils/TimeUtils.h"
#include "utils/RosterUtils.h"
#include "../utils/StringUtils.h"
#include "rule6011/CheckMinRestBetweenConsecutiveDaysRule.h"
#include "RuleFactory.h"

using namespace std;

using OccupationStatus = Helper6001::OccupationStatus;

// ADM pilot list & Cabin crew exceptions
// TODO: load list from file
std::unordered_set<std::string> exceptionList = {

};

std::unordered_set<std::string> testCrews = {
		"30173"
};

std::unordered_set<std::string> RDOParamCache::blockAssignments{};
int RDOParamCache::blockDayNum{ 0 };
long long RDOParamCache::blockCheckOut{ 24 * 3600 };
long long RDOParamCache::blockCheckIn{ 0 };
time_t daySeconds = 3600 * 24;
struct Block {
	bool isRDO = false;
	size_t start = 0;
	size_t restStart = 24 * 3600;
	int rosterIdx = -1;
};

// grey day leadOut available
static void SetGreyDayAvailableTemp(const std::bitset<Helper6001::RosterPeriodLength>& status, const vector<SharedPtr<ROSTER>>& rosters, std::bitset<Helper6001::RosterPeriodLength>& uaSlot, const RDOParamCache& cache, time_t rangeStart) {
    int statusIdx = 0;
    int n = (int)status.size();
    for(int i = 0; i < n; i++){
        if(!uaSlot.test(i)){
            if(!(i + 1 < n && status.test(i + 1))
               && !(i > 0 && status.test(i - 1)))
                uaSlot.set(i);
        }
    }
}

// grey day leadOut available
static void SetGreyDayLeadOutAvailable(const std::bitset<Helper6001::RosterPeriodLength>& status, const vector<SharedPtr<ROSTER>>& rosters, std::bitset<Helper6001::RosterPeriodLength>& uaSlot, const RDOParamCache& cache, time_t rangeStart) {
	size_t statusIdx = 0;
	size_t rosterIdx = 0;
	while (statusIdx < (int)status.size()) {
		if (status.test(statusIdx)) {
			while (statusIdx + 1 < (int)status.size()) {
				if (!status.test(statusIdx + 1)) break;
				statusIdx++;
			}
			while (rosterIdx < rosters.size()) {
				auto dayIdx = (rosters.at(rosterIdx)->actStrLoc - rangeStart) / daySeconds;
				if (dayIdx > (time_t)statusIdx + 1) break;
				rosterIdx++;
			}
			if (statusIdx + 1 < (int)uaSlot.size() && rosterIdx < rosters.size()) {
				bool isRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters.at(rosterIdx)->qualifier) != cache.restAssignments.end();
				auto dayIdx = (rosters.at(rosterIdx)->actStrLoc - rangeStart) / daySeconds;
				if (!isRest && dayIdx == (long long)statusIdx + 2 && rosters.at(rosterIdx)->actStrLoc % daySeconds < cache.greyDayLeadOut) {
					uaSlot.set(statusIdx + 1);
				}
			}
		}
		statusIdx++;
	}
}

// Mon to Fri (5 day block) =  RDO Sat and Sun.
// annual leave on Fri(1 day) = RDO Sat and Sun.
static bool CheckAnnualLeaveRDO(const std::bitset<Helper6001::RosterPeriodLength>& status, const vector<SharedPtr<ROSTER>>& rosters, time_t rangeStart, const RDOParamCache& cache) {
	time_t startTimeT = rangeStart;
	auto startWeekDay = std::localtime(&startTimeT)->tm_wday;
	std::bitset<2 * Helper6001::RosterPeriodLength> annualLeaveStatus;
	std::bitset<2 * Helper6001::RosterPeriodLength> rdoStatus;
	for (auto& roster : rosters) {
		auto dayIdx = (roster->actStrLoc - rangeStart) / daySeconds;
        auto isAL = find(cache.alAssignments.begin(), cache.alAssignments.end(), roster->duty) != cache.alAssignments.end();
        if (roster->actStrLoc < rangeStart && (roster->actStrLoc - rangeStart) % daySeconds != 0)
            dayIdx--;
		auto idx = dayIdx + (long long)Helper6001::RosterPeriodLength;
		if (isAL && idx >= 0 && idx < (int)annualLeaveStatus.size())
			annualLeaveStatus.set((size_t)idx);
		if ((roster->duty == cache.RDOAssignment || roster->qualifier == "SDO") && idx >= 0 && idx < Helper6001::RosterPeriodLength)
			rdoStatus.set((size_t)idx);
	}
	for (size_t i = 0; i < status.size(); i++) {
		if (status.test(i))
			rdoStatus.set(i + Helper6001::RosterPeriodLength);
	}
	size_t i = 0;
	while (i < 2 * Helper6001::RosterPeriodLength) {
		if (annualLeaveStatus.test(i)) {
			while (i + 1 < 2 * Helper6001::RosterPeriodLength) {
				if (!annualLeaveStatus.test(i + 1)) break;
				i++;
			}
			/*time_t curTime = rangeStart + (i - Helper6001::RosterPeriodLength) * 24 * 3600;
			auto curWeekDay = std::localtime(&curTime)->tm_wday;*/
			auto curWeekDay = (i % 7 + startWeekDay) % 7;						// 暂认为28天周期固定，否则需调用localTime，较耗时
			if (curWeekDay == 5													// Fri = AL
				&& ((i + 1 < rdoStatus.size() && i + 1 >= Helper6001::RosterPeriodLength && !rdoStatus.test(i + 1))		// Sta = RDO
					|| (i + 2 < rdoStatus.size() && i + 2 >= Helper6001::RosterPeriodLength && !rdoStatus.test(i + 2)))) {	// Sun = RDO
				return false;
			}
		}
		i++;
	}
	return true;
}

static bool CheckBlankDayNum(const std::bitset<Helper6001::RosterPeriodLength>& status, const vector<SharedPtr<ROSTER>>& rosters, const RDOParamCache& cache, long rangeStart, int uaNum) {
	int invalidBlankDayCount = 0;
	time_t sbyRestHrs = 10;
	time_t sbyLength = 12;
	time_t maxClock = 10;
	time_t minClock = 5;
	std::map<size_t, Block> dayIdxToBlock;
	for (size_t i = 0; i < status.size(); i++) {
		if (status.test(i)) {
			Block block;
			block.isRDO = true;
			dayIdxToBlock[i] = block;
		}
	}
	for (size_t i = 0; i < rosters.size(); i++) {
		if (rosters.at(i)->duty == cache.RDOAssignment || rosters.at(i)->qualifier == "SDO")
			continue;
		auto startDayIdx = (rosters.at(i)->actStrLoc - rangeStart) / daySeconds;
		auto restStartDayIdx = (rosters.at(i)->restStrLoc - rangeStart) / daySeconds;
		/*if (rosters.at(i)->restStrLoc % (24 * 3600) < 3600)
			restStartDayIdx--;*/
		for (auto dayIdx = startDayIdx; dayIdx <= restStartDayIdx; dayIdx++) {
			Block block;
			block.rosterIdx = (int)i;
			if (dayIdx == startDayIdx)
				block.start = static_cast<size_t>(rosters.at(i)->actStrLoc % daySeconds);
			if (dayIdx == restStartDayIdx)
				block.restStart = static_cast<size_t>(rosters.at(i)->restStrLoc % daySeconds);
			dayIdxToBlock[(size_t)dayIdx] = block;
		}
	}
	size_t dayIdx = 0;
	while (dayIdx < Helper6001::RosterPeriodLength) {
		// 非空白天
		if (dayIdxToBlock.find(dayIdx) != dayIdxToBlock.end()) {
			dayIdx++;
			continue;
		}
		// 非单个空白天
		if (dayIdxToBlock.find(dayIdx + 1) == dayIdxToBlock.end()
			|| dayIdxToBlock.find(dayIdx - 1) == dayIdxToBlock.end()) {
			dayIdx++;
			continue;
		}
		bool valid = true;
		auto& prevBlock = dayIdxToBlock.at(dayIdx - 1);
		auto& nextBlock = dayIdxToBlock.at(dayIdx + 1);
		// 检查单个空白天
		// roster + blank day + roster
		if (!prevBlock.isRDO && !nextBlock.isRDO) {
			auto& prevRoster = rosters.at(prevBlock.rosterIdx);
			auto& nextRoster = rosters.at(nextBlock.rosterIdx);
			bool isRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), nextRoster->qualifier) != cache.restAssignments.end();
			long long restStartTime = prevRoster->restStrLoc;
			long long endTime = prevRoster->actEndLoc;
			// SBY +10hrs休息
			if (prevRoster->qualifier == "SBY" || prevRoster->qualifier == "EXSBY")
				endTime += sbyRestHrs * 3600;
			auto endClock = endTime % daySeconds;
			// 取整点
			auto hour = endClock / 3600;
			if (endClock % 3600 > 0) {
				hour = hour + 1;
			}
			endClock = hour * 3600;
			auto restStartDayIdx = (restStartTime - rangeStart) / daySeconds;
			auto endDayIdx = (endTime - rangeStart) / daySeconds;
			if (endDayIdx == restStartDayIdx || endClock < minClock * 3600)
				endClock = minClock * 3600;
			valid = valid && endClock <= maxClock * 3600;
			if (valid && isRest)
				valid = valid && endClock + sbyLength * 3600 <= daySeconds + nextRoster->actStrLoc % daySeconds;
			else if (valid)
				valid = valid && endClock + (sbyLength + sbyRestHrs) * 3600 <= daySeconds + nextRoster->actStrLoc % daySeconds;
		}
		/*
		// roster + blank day + RDO
		else if (!prevBlock.isRDO && nextBlock.isRDO) {
			auto& prevRoster = rosters.at(prevBlock.rosterIdx);
			long long restStartTime = prevRoster->restStrLoc;
			long long endTime = prevRoster->actEndLoc;
			// SBY +10hrs休息
			if (prevRoster->qualifier == "SBY" || prevRoster->qualifier == "EXSBY")
				endTime += sbyRestHrs * 3600;
			int endClock = endTime % (3600 * 24);
			// 取整点
			int hour = endClock / 3600;
			if (endClock % 3600 > 0) {
				hour = hour + 1;
			}
			endClock = hour * 3600;
			int restStartDayIdx = (restStartTime - rangeStart) / (3600 * 24);
			int endDayIdx = (endTime - rangeStart) / (3600 * 24);
			if (endDayIdx == restStartDayIdx || endClock < minClock * 3600)
				endClock = minClock * 3600;
			valid = valid && endClock <= maxClock * 3600;
			// RDO leadIn
			valid = valid && endClock + sbyLength * 3600 <= cache.leadIn;
			// RDO length
			for (int i = dayIdx + 2; i < dayIdx + Helper6001::RosterPeriodLength; i++) {
				auto it = dayIdxToBlock.find(i);
				if (it != dayIdxToBlock.end() && it->second.isRDO)
					continue;
				if (it != dayIdxToBlock.end()) {
					auto& roster = rosters.at(it->second.rosterIdx);
					bool isRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), roster->qualifier) != cache.restAssignments.end();
					if (!isRest) {
						long leftTime = cache.minLength - roster->actStrLoc % (3600 * 24);
						if (leftTime < 0)
							leftTime = 0;
						valid = valid && endClock + sbyLength * 3600 + leftTime <= 24 * 3600;
					}
				}
				break;
			}
		}
		// RDO + blank day + roster
		else if (prevBlock.isRDO && !nextBlock.isRDO) {
			bool multiRDO = false;
			auto prevPrevIt = dayIdxToBlock.find(dayIdx - 2);
			if (prevPrevIt != dayIdxToBlock.end()) {
				if (prevPrevIt->second.isRDO)
					multiRDO = true;
			}
			auto& nextRoster = rosters.at(nextBlock.rosterIdx);
			bool isRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), nextRoster->qualifier) != cache.restAssignments.end();
			// RDO leadOut
			long leadOut = cache.singleLeadOut > minClock ? cache.singleLeadOut : minClock;
			if(multiRDO)
				leadOut = cache.multipleLeadOut > minClock ? cache.multipleLeadOut : minClock;
			if (!isRest) {
				valid = valid && leadOut + (sbyLength + sbyRestHrs) * 3600 <= 24 * 3600 + nextRoster->actStrLoc % (24 * 3600);
			}
			else {
				valid = valid && leadOut + sbyLength * 3600 <= 24 * 3600 + nextRoster->actStrLoc % (24 * 3600);
			}
			// RDO length
			for (int i = dayIdx - 2; i > dayIdx - Helper6001::RosterPeriodLength; i--) {
				auto it = dayIdxToBlock.find(i);
				if (it != dayIdxToBlock.end() && it->second.isRDO)
					continue;
				if (it != dayIdxToBlock.end()) {
					auto& roster = rosters.at(it->second.rosterIdx);
					bool isRestTemp = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), roster->qualifier) != cache.restAssignments.end();
					if (!isRestTemp) {
						long leftTime = cache.minLength - (24 * 3600 - roster->actRestStrLoc % (3600 * 24));
						if (leftTime < 0)
							leftTime = 0;
						long startClock = leftTime > minClock ? leftTime : minClock;
						if (isRest) {
							valid = valid && startClock + sbyLength * 3600 <= 24 * 3600 + nextRoster->actStrLoc % (24 * 3600);
						}
						else
							valid = valid && startClock + (sbyLength + sbyRestHrs) * 3600 <= 24 * 3600 + nextRoster->actStrLoc % (24 * 3600);
					}
				}
				break;
			}
		}
		// RDO + blank day + RDO
		else if (prevBlock.isRDO && nextBlock.isRDO) {
			long startClock = 0;
			long endClock = cache.leadIn;
			bool prevMultiRDO = false;
			auto prevPrevIt = dayIdxToBlock.find(dayIdx - 2);
			if (prevPrevIt != dayIdxToBlock.end()) {
				if (prevPrevIt->second.isRDO)
					prevMultiRDO = true;
			}
			// prev leadOut
			if (prevMultiRDO) {
				startClock = cache.multipleLeadOut;
			}
			else {
				startClock = cache.singleLeadOut;
			}
			startClock = startClock > minClock * 3600 ? startClock : minClock * 3600;
			// prev RDO length
			for (int i = dayIdx - 2; i > dayIdx - Helper6001::RosterPeriodLength; i--) {
				auto it = dayIdxToBlock.find(i);
				if (it != dayIdxToBlock.end() && it->second.isRDO)
					continue;
				if (it != dayIdxToBlock.end()) {
					auto& roster = rosters.at(it->second.rosterIdx);
					bool isRestTemp = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), roster->qualifier) != cache.restAssignments.end();
					if (!isRestTemp) {
						long leftTime = cache.minLength - (24 * 3600 - roster->actRestStrLoc % (3600 * 24));
						if (leftTime < 0)
							leftTime = 0;
						startClock = startClock > leftTime ? startClock : leftTime;
					}
				}
				break;
			}
			// next RDO length
			for (int i = dayIdx + 2; i < dayIdx + Helper6001::RosterPeriodLength; i++) {
				auto it = dayIdxToBlock.find(i);
				if (it != dayIdxToBlock.end() && it->second.isRDO)
					continue;
				if (it != dayIdxToBlock.end()) {
					auto& roster = rosters.at(it->second.rosterIdx);
					bool isRestTemp = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), roster->qualifier) != cache.restAssignments.end();
					if (!isRestTemp) {
						long leftTime = cache.minLength - roster->actStrLoc % (3600 * 24);
						if (leftTime < 0)
							leftTime = 0;
						endClock = endClock < 24 * 3600 - leftTime ? endClock : 24 * 3600 - leftTime;
					}
				}
				break;
			}
			valid = valid && startClock + sbyLength * 3600 <= endClock;
		}
		*/
		if (!valid)
			invalidBlankDayCount++;
		dayIdx++;
	}
	if (uaNum < 0)
		return 0 >= invalidBlankDayCount;
	else
		return uaNum >= invalidBlankDayCount;
}

// (6010)检查AL block前后roster的check out/in
static bool CheckALBlockLegality(const std::bitset<Helper6001::RosterPeriodLength>& status, const vector<SharedPtr<ROSTER>>& rosters, const RDOParamCache& cache, time_t rangeStart) {
	std::bitset<2 * Helper6001::RosterPeriodLength> blockStatus;
	for (auto& roster : rosters) {
		if (RDOParamCache::blockAssignments.find(roster->qualifier) != RDOParamCache::blockAssignments.end()) {
			auto dayIdx = (roster->actStrLoc - rangeStart) / daySeconds;
            if (roster->actStrLoc < rangeStart && (rangeStart - roster->actStrLoc) % daySeconds != 0)
                dayIdx--;
			auto blockIdx = dayIdx + (long long)Helper6001::RosterPeriodLength;
			if (blockIdx >= 0 && blockIdx < (int)blockStatus.size())
				blockStatus.set((size_t)blockIdx);
		}
	}
	for (size_t i = 0; i < status.size(); i++) {
		if (status.test(i))
			blockStatus.set(i + Helper6001::RosterPeriodLength);
	}
	auto CheckInLegality = [&](const std::shared_ptr<ROSTER>& roster) {
		auto dayIdx = (roster->actStrLoc - rangeStart) / daySeconds;
        if (roster->actStrLoc < rangeStart && (rangeStart - roster->actStrLoc) % daySeconds != 0)
            dayIdx--;
		auto blockIdx = dayIdx + (long long)Helper6001::RosterPeriodLength;
		if (blockIdx - RDOParamCache::blockDayNum >= 0 && blockIdx - 1 < (int)blockStatus.size()) {
			bool blockContinue = true;
			for (auto i = blockIdx - 1; i >= blockIdx - RDOParamCache::blockDayNum; i--) {
				if (!blockStatus.test((size_t)i)) {
					blockContinue = false;
					break;
				}
			}
			if (blockContinue
				&& roster->actStrLoc % daySeconds < RDOParamCache::blockCheckIn) {
				return false;
			}
		}
		return true;
	};
	auto CheckOutLegality = [&](const std::shared_ptr<ROSTER>& roster) {
		auto endDayIdx = (roster->actRestStrLoc - rangeStart) / daySeconds;
        if (roster->actRestStrLoc < rangeStart && (rangeStart - roster->actRestStrLoc) % daySeconds != 0)
            endDayIdx--;
		auto endBlockIdx = endDayIdx + (long long)Helper6001::RosterPeriodLength;
		if (endBlockIdx + 1 >= 0 && endBlockIdx + RDOParamCache::blockDayNum < (int)blockStatus.size()) {
			bool blockContinue = true;
			for (auto i = endBlockIdx + 1; i <= endBlockIdx + RDOParamCache::blockDayNum; i++) {
				if (!blockStatus.test((size_t)i)) {
					blockContinue = false;
					break;
				}
			}
			if (blockContinue
				&& roster->actRestStrLoc % daySeconds > RDOParamCache::blockCheckOut) {
				return false;
			}
		}
		return true;
	};
	int rosterNum = (int)rosters.size();
	for (int i = 0; i < rosterNum; i++) {
		bool isRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters[i]->qualifier) != cache.restAssignments.end();
		if (!isRest) {
			bool isCheckInPA = false;
			bool isCheckOutPA = false;
			// 预占违规
			if (i - 1 >= 0
				&& rosters[i]->source == "PA" && rosters[i - 1]->source == "PA"
				&& rosters[i]->strLoc / daySeconds - rosters[i - 1]->restStrLoc / daySeconds == 1)
				isCheckInPA = true;
			if (!isCheckInPA && !CheckInLegality(rosters[i]))
				return false;
			// 预占违规
			if (i + 1 < rosterNum 
				&& rosters[i]->source == "PA" && rosters[i + 1]->source == "PA"
				&& rosters[i + 1]->strLoc / daySeconds - rosters[i]->restStrLoc / daySeconds == 1)
				isCheckOutPA = true;
			if (!isCheckOutPA && !CheckOutLegality(rosters[i]))
				return false;
		}
	}
	return true;
}

//检查minLength和leadOut，leadIn在howManyRDOInRange已完成合规性检查
//minLength：	两个非休息Roster之间的length >= minLength + RDO count * 24 * 3600
//leadOut：		对于single RDO相邻后继roster采用single leadOut值，multiple RDO采用multiple leadOut值
bool LegalityChecker::CheckRDOLengthAndLeadOutLegality(const std::bitset<Helper6001::RosterPeriodLength>& status, const vector<SharedPtr<ROSTER>>& rosters, const RDOParamCache &cache, time_t rangeStart, time_t rangeEnd, RULE_LEGALITY* pCrew, const DBRule* singleRule, const bool isWarning) {
	auto IsSingleRDOCheck = [&status, &rosters, &rangeStart, &cache](int lastRDODayIdx, int nextRosterIdx, int prevRosterIdx, SharedPtr<CrewDataContext> dbData) {
		// 前一个status也是RDO
		if (lastRDODayIdx > 0 && status.test(lastRDODayIdx - 1))
			return false;
		// 否则，找前一个roster
		else if (lastRDODayIdx < 1
			&& nextRosterIdx > prevRosterIdx
			&& (dbData->isAssignmentInGroup(rosters[nextRosterIdx - 1]->qualifier, cache.RDOAssignment) || rosters[nextRosterIdx - 1]->qualifier == "SDO")) {
			auto prevRDODayIdx = (rosters[nextRosterIdx - 1]->actStrLoc - rangeStart) / daySeconds;
			// 是相邻的RDO
			if (prevRDODayIdx == lastRDODayIdx - 1)
				return false;
			// 与nextLastRDODayIdx重合，再往前找一个roster
			else if (prevRDODayIdx == lastRDODayIdx) {
				if (nextRosterIdx - 1 > prevRosterIdx
					&& (dbData->isAssignmentInGroup(rosters[nextRosterIdx - 2]->qualifier, cache.RDOAssignment) || rosters[nextRosterIdx - 2]->qualifier == "SDO")) {
					auto prevPrevRDODayIdx = (rosters[nextRosterIdx - 2]->actStrLoc - rangeStart) / daySeconds;
					// 是相邻的RDO
					if (prevPrevRDODayIdx >= lastRDODayIdx - 1)
						return false;
				}
			}
		}
		return true;
	};
	bool result = true;
	// 首个roster之前的RDO检查
	{
		std::size_t firstIdx = 0;
		
		while (firstIdx < rosters.size()) {
			bool isRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters[firstIdx]->qualifier) != cache.restAssignments.end();
			int firstDayIdx = static_cast<int>(rosters[firstIdx]->actStrLoc - rangeStart) / (3600 * 24);
            if (rosters[firstIdx]->actStrLoc < rangeStart &&
                (rangeStart - rosters[firstIdx]->actStrLoc) % daySeconds != 0)
                firstDayIdx--;
			if (!isRest && firstDayIdx >= 0) {
				break;
			}
			firstIdx++;
		}
		if (firstIdx >= rosters.size())
			return true;
		int lastRDODayIdx = -2;
		int firstDayIdx = static_cast<int>(rosters[firstIdx]->actStrLoc - rangeStart) / (3600 * 24);
		// 前一个RP的RDO数量
		for (std::size_t i = 0; i < firstIdx; i++) {
			int dayIdx = static_cast<int>(rosters[i]->actStrLoc - rangeStart) / (3600 * 24);
            if (rosters[i]->actStrLoc - rangeStart < 0 &&
                (rangeStart - rosters[i]->actStrLoc) % daySeconds != 0) {
                dayIdx--;
            }
			if (dayIdx >= 0)
				break;
			bool isRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters[i]->qualifier) != cache.restAssignments.end();
			//非休息则清零
			if (!isRest) {
				lastRDODayIdx = -2;
			}
			else if (_dbData->isAssignmentInGroup(rosters[i]->qualifier, cache.RDOAssignment) || rosters[i]->qualifier == "SDO") {
				lastRDODayIdx = dayIdx;
			}
		}
		// 当前RP的RDO数量
		for (int i = 0; i < firstDayIdx && i < (int)status.size(); i++) {
			if (status.test(i)) {
				lastRDODayIdx = i;
			}
		}
		// roster与RDO相邻
		if (lastRDODayIdx + 1 == firstDayIdx) {
			bool singleRDO = IsSingleRDOCheck(lastRDODayIdx, (int)firstIdx, 0, _dbData);
			// single leadOut检查
			if (singleRDO && rosters[firstIdx]->actStrLoc % (3600 * 24) < cache.singleLeadOut) {
				if (this->GetApplication() == ROSTER_OPTIMIZER || !isWarning)
					return false;
				// 输出违规信息
				string msg = "Duty cannot commence earlier than ({0:singleLeadOutHHmm}) preceding a single RDO.";
				msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(cache.singleLeadOut / 60));

				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->rosterId = rosters[firstIdx]->rosterId;
				rv->pairingId = rosters[firstIdx]->pairId;
				rv->startDTUtc = rosters[firstIdx]->actStrUtc;
				rv->endDTUtc = rosters[firstIdx]->actEndUtc;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
				this->addRuleViolations(rv, singleRule);
			}
			// multiple leadOut检查
			else if (!singleRDO && rosters[firstIdx]->actStrLoc % (3600 * 24) < cache.multipleLeadOut)
			{
				if (this->GetApplication() == ROSTER_OPTIMIZER || !isWarning)
					return false;
				// 输出违规信息
				string msg = "Duty cannot commence earlier than ({0:multipleLeadOutHHmm}) preceding consecutive RDOs.";
				msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(cache.multipleLeadOut / 60));

				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->rosterId = rosters[firstIdx]->rosterId;
				rv->pairingId = rosters[firstIdx]->pairId;
				rv->startDTUtc = rosters[firstIdx]->actStrUtc;
				rv->endDTUtc = rosters[firstIdx]->actEndUtc;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
				this->addRuleViolations(rv, singleRule);
			}
		}
	}
	//任意两个非休息roster之间的RDO检查
	std::size_t prevRosterIdx = 0;
	std::size_t nextRosterIdx = 1;
	while (nextRosterIdx < rosters.size()) {
		bool isPrevRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters[prevRosterIdx]->qualifier) != cache.restAssignments.end();
		bool isNextRest = std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters[nextRosterIdx]->qualifier) != cache.restAssignments.end();
		int prevDayIdx = static_cast<int>(rosters[prevRosterIdx]->actStrLoc - rangeStart) / (3600 * 24);
		int nextDayIdx = static_cast<int>(rosters[nextRosterIdx]->actStrLoc - rangeStart) / (3600 * 24);
        if (rosters[prevRosterIdx]->actStrLoc < rangeStart &&
            (rangeStart - rosters[prevRosterIdx]->actStrLoc) % daySeconds != 0)
            prevDayIdx--;
        if (rosters[nextRosterIdx]->actStrLoc < rangeStart &&
            (rangeStart - rosters[nextRosterIdx]->actStrLoc) % daySeconds != 0)
            nextDayIdx--;
		if (isPrevRest || nextDayIdx < 0) {
			prevRosterIdx = nextRosterIdx;
			nextRosterIdx = prevRosterIdx + 1;
			continue;
		}
		if (isNextRest) {
			nextRosterIdx += 1;
			continue;
		}
		int startDayIdx = prevDayIdx >= 0 ? prevDayIdx : 0;
		int endDayIdx = nextDayIdx < Helper6001::RosterPeriodLength ? nextDayIdx : Helper6001::RosterPeriodLength - 1;
		int dayRDOCount = 0;
		int lastRDODayIdx = -2;		// 默认值-2表示当前RP往前两天
		// 前一个RP的RDO数量
		for (std::size_t i = prevRosterIdx + 1; i < nextRosterIdx; i++) {
			int dayIdx = static_cast<int>(rosters[i]->actStrLoc - rangeStart) / (3600 * 24);
            if (rosters[i]->actStrLoc < rangeStart &&
                (rangeStart - rosters[i]->actStrLoc) % daySeconds != 0)
                dayIdx--;
			if (dayIdx >= 0)
				break;
			if (_dbData->isAssignmentInGroup(rosters[i]->qualifier, cache.RDOAssignment) || rosters[i]->qualifier == "SDO") {
				dayRDOCount++;
				lastRDODayIdx = dayIdx;
			}
		}
		// 当前RP的RDO数量
		for (int i = startDayIdx; i <= endDayIdx && i < (int)status.size(); i++) {
			if (status.test(i)) {
				dayRDOCount++;
				lastRDODayIdx = i;
			}
		}
		// min length检查
		if (dayRDOCount > 0 && rosters[nextRosterIdx]->actStrLoc - rosters[prevRosterIdx]->actRestStrLoc < cache.minLength + dayRDOCount * 24 * 3600) {
			if (this->GetApplication() == ROSTER_OPTIMIZER || !isWarning)
				return false;
			// 输出违规信息
			string msg = "The length of RDO ({0:dayRDOCount}) must be at least {1:minLengthAdddayRDOCount}.";
			msg = StringUtils::Format(msg, dayRDOCount, TimeUtils::MinutesTohhmm((cache.minLength + dayRDOCount * 24 * 3600) / 60));

			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			rv->rosterId = rosters[prevRosterIdx]->rosterId;
			rv->pairingId = rosters[prevRosterIdx]->pairId;
			rv->startDTUtc = rosters[prevRosterIdx]->actEndUtc;
			rv->endDTUtc = rosters[nextRosterIdx]->actStrUtc;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
			this->addRuleViolations(rv, singleRule);
		}

		// roster与RDO相邻
		if (lastRDODayIdx + 1 == nextDayIdx) {
			bool singleRDO = IsSingleRDOCheck(lastRDODayIdx, (int)nextRosterIdx, (int)prevRosterIdx, _dbData);
			// single leadOut检查
			if (singleRDO && rosters[nextRosterIdx]->actStrLoc % (3600 * 24) < cache.singleLeadOut) {
				if (this->GetApplication() == ROSTER_OPTIMIZER || !isWarning)
					return false;
				// 输出违规信息
				string msg = "Duty cannot commence earlier than ({0:singleLeadOutHHmm}) preceding a single RDO.";
				msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(cache.singleLeadOut / 60));

				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->rosterId = rosters[nextRosterIdx]->rosterId;
				rv->pairingId = rosters[nextRosterIdx]->pairId;
				rv->startDTUtc = rosters[nextRosterIdx]->actStrUtc;
				rv->endDTUtc = rosters[nextRosterIdx]->actEndUtc;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
				this->addRuleViolations(rv, singleRule);
					
				result = false;
			}
			// multiple leadOut检查
			else if (!singleRDO && rosters[nextRosterIdx]->actStrLoc % (3600 * 24) < cache.multipleLeadOut) {
				if (this->GetApplication() == ROSTER_OPTIMIZER || !isWarning)
					return false;
				// 输出违规信息
				string msg = "Duty cannot commence earlier than ({0:multipleLeadOutHHmm}) preceding consecutive RDOs.";
				msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(cache.multipleLeadOut / 60));

				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->rosterId = rosters[nextRosterIdx]->rosterId;
				rv->pairingId = rosters[nextRosterIdx]->pairId;
				rv->startDTUtc = rosters[nextRosterIdx]->actStrUtc;
				rv->endDTUtc = rosters[nextRosterIdx]->actEndUtc;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
				this->addRuleViolations(rv, singleRule);
					
				result = false;
			}
		}
		prevRosterIdx = nextRosterIdx;
		nextRosterIdx = prevRosterIdx + 1;
	}
	return result;
}

static void GenerateStatusUABackup(std::vector<std::vector<OccupationStatus>>& statusVec,
	const std::vector<OccupationStatus>& status,
	const std::vector<std::set<int>>& backupCopyVec,
	std::vector<int>& backupCopy, int index) {
	if (index == backupCopyVec.size()) {
		std::vector<OccupationStatus> statusTemp(status);
		for (auto item : backupCopy) {
			statusTemp[item] = OccupationStatus::UNASSIGNED_DAY_AVAILABLE;
		}
		statusVec.push_back(statusTemp);
		return;
	}

	for (int item : backupCopyVec[index]) {
		backupCopy.push_back(item);
		GenerateStatusUABackup(statusVec, status, backupCopyVec, backupCopy, index + 1);
		backupCopy.pop_back();
	}
}
std::vector<std::vector<OccupationStatus>> LegalityChecker::howManyRDOInRange(const RDOParamCache& cache, SharedPtr<CrewDataContext>& dbData, RULE_LEGALITY* pCrew, vector<SharedPtr<ROSTER>>& rosters, time_t rangeStart, time_t rangeEnd, time_t prevRPRosterEndTime, const vector<string>& restAssignmentGroup, bool isSplit, bool& prevStartValid)
{
    long leadIn = cache.leadIn;
    long leadOut = cache.multipleLeadOut < cache.singleLeadOut ? cache.multipleLeadOut : cache.singleLeadOut;
    long minLength = cache.minLength;
    const auto& restAssignments = cache.restAssignments;
	const auto& rules = this->_dbData->getRuleFunctions(RULES::MIN_CONSECUTIVE_RDO);
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	std::vector<std::vector<OccupationStatus>> statusVec;
	std::vector<OccupationStatus> status(Helper6001::RosterPeriodLength, OccupationStatus::DUTY_OCCUPIED);
	std::vector<std::set<int>> backupCopyVec;
	int iSize = (int)rosters.size();
	time_t next_start;
	time_t actEnd = 0;

	// Tracking阶段，根据manday填充未加载的roster
	if (this->GetApplication() != ROSTER_OPTIMIZER) {
		time_t rosterStart = 0;
		time_t rosterEnd = 0;
		if (!rosters.empty()) {
			rosterStart = rosters[0]->getStartTimeLocAct();
			rosterEnd = rosters[rosters.size() - 1]->getEndTimeLocAct();
		}
		const auto& mandayfdList = crew->mandayFdList;
		if (!mandayfdList.empty()) {
			for (const auto& manday : mandayfdList) {
				if ((manday->IS_AL < 1) && !(manday->custData2 > 0)) continue;
				if (manday->dateLoc > rangeStart && manday->dateLoc <= rangeEnd) {
					if (rosterStart == 0 || rosterEnd == 0 || manday->dateLoc < rosterStart || manday->dateLoc > rosterEnd) {
						int day = static_cast<int>(manday->dateLoc - rangeStart) / (3600 * 24);
						if (day < Helper6001::RosterPeriodLength) {
							if (manday->IS_AL > 0)
								status.at(day) = OccupationStatus::ANNUAL_LEAVE_OCCUPIED;
							if (manday->custData2 > 0)
								status.at(day) = OccupationStatus::ROSTER_DAYS_OFF_OCCUPIED;
						}
					}
				}
			}
		}
		const auto& mandayccList = crew->mandayCcAmList;
		if (!mandayccList.empty()) {
			for (const auto& manday : mandayccList) {
				if (!manday->IS_AL && !(manday->custData2 > 0)) continue;
				if (manday->dateLoc > rangeStart && manday->dateLoc <= rangeEnd) {
					if (rosterStart == 0 || rosterEnd == 0 || manday->dateLoc < rosterStart || manday->dateLoc > rosterEnd) {
						int day = static_cast<int>(manday->dateLoc - rangeStart) / (3600 * 24);
						if (day < Helper6001::RosterPeriodLength) {
							if (manday->IS_AL)
								status.at(day) = OccupationStatus::ANNUAL_LEAVE_OCCUPIED;
							if (manday->custData2 > 0)
								status.at(day) = OccupationStatus::ROSTER_DAYS_OFF_OCCUPIED;
						}
					}
				}
			}
		}
	}

	if (isSplit)
	{
		for (int i = 0; i < iSize; i++)
		{
			string roster_assignment = rosters[i]->qualifier;
			string next_roster_assignment;
			// 使用rest，则从roster的休息开始时间开始计算

			time_t end = rosters[i]->actRestStrLoc > actEnd ? rosters[i]->actRestStrLoc : actEnd;
			time_t start = rosters[i]->actStrLoc;
			actEnd = end;
			// 判断是否在RP周期内
			if (!(end > rangeStart || start < rangeEnd))
				continue;

			//是否rest
			bool isRest = std::find(restAssignments.begin(), restAssignments.end(), rosters[i]->qualifier) != restAssignments.end();
            auto isAL = find(cache.alAssignments.begin(), cache.alAssignments.end(), rosters[i]->duty) != cache.alAssignments.end();

			//前一个roster为已排RDO/SDO且与当前非休息roster相邻，则当前roster开始时间需要大于leadOut
			//否则直接违规，return
			if (i - 1 >= 0
				&& !isRest
				&& (dbData->isAssignmentInGroup(rosters.at(i - 1)->qualifier, cache.RDOAssignment) || rosters.at(i - 1)->qualifier == "SDO")
				&& start / (3600 * 24) - (rosters[i - 1]->actRestStrLoc / (3600 * 24) + 1) == 0
				&& start % (3600 * 24) < leadOut) {
				prevStartValid = false;
				if (this->GetApplication() == ROSTER_OPTIMIZER)
					return statusVec;
				
			}
			//后一个roster为已排RDO/SDO且与当前非休息roster相邻，则当前roster结束时间需要小于leadIn
			//否则直接违规，return
			if (i + 1 < iSize
				&& !isRest
				&& (dbData->isAssignmentInGroup(rosters.at(i + 1)->qualifier, cache.RDOAssignment) || rosters.at(i + 1)->qualifier == "SDO")
				&& rosters[i + 1]->actStrLoc / (3600 * 24) - (end / (3600 * 24) + 1) == 0
				&& end % (3600 * 24) > leadIn) {
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					prevStartValid = false;
					return statusVec;
				}
				string msg = "Duty cannot finish later than ({0:leadInHHmm}) prior to an RDO.";
				msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(leadIn / 60));

				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, &rules[0], msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->rosterId = rosters[i]->rosterId;
				rv->pairingId = rosters[i]->pairId;
				rv->startDTUtc = rosters[i]->actStrUtc;
				rv->endDTUtc = rosters[i]->actEndUtc;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
				this->addRuleViolations(rv, &rules[0]);

			}

			int day = static_cast<int>(start - rangeStart) / (3600 * 24);
			//避免status索引day越界保护
			if (day >= (int)status.size()) { day = (int)status.size() - 1; }
			if (day < 0) { day = 0; }

			// 预占RDO填入，hardcode: RDO, SDO, AL
            if (rosters[i]->qualifier == "SDO") {
                status.at(day) = OccupationStatus::SUBSTITUTED_DAYS_OFF_PRE_ASSIGNMENT;
            }
			else if (dbData->isAssignmentInGroup(rosters.at(i)->qualifier, cache.RDOAssignment)) {
				status.at(day) = OccupationStatus::ROSTER_DAYS_OFF_OCCUPIED;
			}
			else if (isAL) {
				status.at(day) = OccupationStatus::ANNUAL_LEAVE_OCCUPIED;
			}

			// RP开始到第一个Roster之间的空白天
			if (i == 0) {
				for (int j = 1; j < day - 1; j++) {
                    if(rangeStart + j * 24 * 3600 > prevRPRosterEndTime)
					status.at(j) = OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE;
				}
				if (day > 0) {
					if (rangeStart - prevRPRosterEndTime >= 24 * 3600 - leadIn
						// 首个roster是休息无需判断leadOut和length
						// length只需要超过 一天+minLength 即可
						&& ((start - rangeStart >= 24 * 3600 + leadOut && start - prevRPRosterEndTime >= minLength + 3600 * 24)
							|| (isAL || isRest))
						) {
						/*	RDO_Ranges range;
							range.startTime = rangeStart;
							range.endTime = (start / (3600 * 24)) * 3600 * 24;*/
						status.at(0) = OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE;
					}
                    // 前RP最后一个roster未占用当前RP第一天
                    else if(rangeStart - prevRPRosterEndTime >= 0) {
						status.at(0) = OccupationStatus::UNASSIGNED_DAY_AVAILABLE;
					}
				}
				if (day > 1 && rangeStart + (day - 1) * 24 * 3600 > prevRPRosterEndTime) {
					if (start - rangeStart >= day * 24 * 3600 + leadOut
						|| (isAL || isRest)) {
						status.at(day - 1) = OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE;
					}
					else {
						status.at(day - 1) = OccupationStatus::UNASSIGNED_DAY_AVAILABLE;
					}
				}
			}




			bool bFind = false;

			// 如果后续有任务,则用后续任务的开始时间，没有的话则用RP的结束时间，并统计到RP结束时间可以安排几个RDO
			if (i + 1 < iSize) {
				next_start = rosters[i + 1]->actStrLoc;
				next_roster_assignment = rosters[i + 1]->qualifier;
			}
			else {
				next_start = rangeEnd;
			}


			bool beforeIsRestAssignment = false;
			bool afterIsRestAssignment = false;
			// 判断前后roster是否是rest assignment
			for (const auto& group : restAssignmentGroup) {
				if (dbData->isAssignmentInGroup(roster_assignment, group)) {
					beforeIsRestAssignment = true;
				}
				if (dbData->isAssignmentInGroup(next_roster_assignment, group)) {
					afterIsRestAssignment = true;
				}
			}
			if (find(restAssignments.begin(), restAssignments.end(), roster_assignment) != restAssignments.end())
				beforeIsRestAssignment = true;
			if (find(restAssignments.begin(), restAssignments.end(), next_roster_assignment) != restAssignments.end())
				afterIsRestAssignment = true;


			// 获取roster end的小时分钟数
			time_t endMin = end % (3600 * 24);
			time_t startMin = next_start % (3600 * 24);

			time_t length = next_start - end;
			// 求任务之间空白的天数
			time_t endDay = (end / (3600 * 24) + 1);
			time_t nextStartDay = (next_start / (3600 * 24));
			int days = static_cast<int>(nextStartDay - endDay);
			time_t rdoStart, rdoEnd;
			time_t rdoStartBackup = 0;
			time_t rdoEndBackup = 0;
			bool prevDayReduce = false;
			bool nextDayReduce = false;
			bool prevOrNextDayReduce = false;
			if (days < 1) {
				continue;
			}
			rdoStart = endDay * 3600 * 24;
			rdoEnd = nextStartDay * 3600 * 24;
			// 结束时间是否满足条件,rest roster 不考虑结束时间, 结束是RP也暂时不考虑
			bool endValid = (endMin <= leadIn || beforeIsRestAssignment);
			// 开始时间是否满足条件
			bool startValid = (startMin >= leadOut || next_start == rangeEnd || afterIsRestAssignment);
			// 开始到结束时长是否满足条件
			bool lengthValid = (next_start - end >= minLength + days * 24 * 3600);

			// 开始结束时间和长度满足RDO要求,或者结束时间是RP结束，则不用减天数
			if (endValid && startValid && (lengthValid || next_start == rangeEnd || beforeIsRestAssignment || afterIsRestAssignment)) {
				rdoStart = endDay * 3600 * 24;
				rdoEnd = nextStartDay * 3600 * 24;
			}
			// 开始时间满足，长度不满足或者结束时间不满足，结束时间往前减一天
			// 如果开始结束时间都满足，但长度不满足，
			else if (days > 1 && endValid && !startValid) {
				rdoEnd = (nextStartDay - 1) * 3600 * 24;
				--days;
				nextDayReduce = true;
			}
			// 结束时间满足，长度不满足或者开始时间不满足，开始时间往后加一天
			else if (days > 1 && startValid && !endValid) {
				rdoStart = (endDay + 1) * 3600 * 24;
				--days;
				prevDayReduce = true;
			}
			// 结束时间满足，长度不满足，1、结束时间往前一天；2、开始时间往后一天
			else if (days > 1 && startValid && endValid && !lengthValid) {
				rdoEndBackup = (nextStartDay - 1) * 3600 * 24;
				rdoStartBackup = (endDay + 1) * 3600 * 24;
				prevOrNextDayReduce = true;
			}
			else if (days > 2 && !startValid && !endValid) {
				rdoStart = (endDay + 1) * 3600 * 24;
				rdoEnd = (nextStartDay - 1) * 3600 * 24;
				days -= 2;
				nextDayReduce = true;
				prevDayReduce = true;
			}
			else if (days == 1) {
				int day = static_cast<int>(rdoStart - rangeStart) / (3600 * 24);
				status.at(day) = OccupationStatus::UNASSIGNED_DAY_AVAILABLE;
				days = 0;
			}
			else {
				continue;
			}


			// 填入bitset
			day = static_cast<int>(rdoStart - rangeStart) / (3600 * 24);
			for (int j = 0; j < days; j++) {
				status.at(day + j) = OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE;
			}
			// 前一天是不符合RDO，但符合UA
			if (prevDayReduce && day != 0) {
				status.at(day - 1) = OccupationStatus::UNASSIGNED_DAY_AVAILABLE;
			}
			// 后一天是不符合RDO，但符合UA
			if (nextDayReduce && day != Helper6001::RosterPeriodLength) {
				status.at(day + days) = OccupationStatus::UNASSIGNED_DAY_AVAILABLE;
			}
			/*if (prevOrNextDayReduce) {
				auto dayBackupStart = static_cast<int>(rdoStartBackup - rangeStart) / (3600 * 24);
				auto dayBackupEnd = static_cast<int>(rdoEndBackup - rangeStart) / (3600 * 24);
				std::set<int> backupCopy;
				if (dayBackupStart != 0) {
					backupCopy.emplace(dayBackupStart - 1);
				}
				if (dayBackupEnd != Helper6001::RosterPeriodLength)
					backupCopy.emplace(dayBackupEnd);
				backupCopyVec.emplace_back(backupCopy);
			}*/

		}
		std::vector<int> backupCopy;
        if(rosters.empty()){
            std::vector<OccupationStatus> statusEmpty(Helper6001::RosterPeriodLength, OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE);
            size_t i = 0;
            while(i < Helper6001::RosterPeriodLength && rangeStart + (time_t)i * 24 * 3600 - prevRPRosterEndTime < 0){
                statusEmpty[i++] = OccupationStatus::DUTY_OCCUPIED;
            }
            GenerateStatusUABackup(statusVec, statusEmpty, backupCopyVec, backupCopy, 0);
        }
        else
		    GenerateStatusUABackup(statusVec, status, backupCopyVec, backupCopy, 0);
	}

	return statusVec;

}

std::vector<std::vector<OccupationStatus>> LegalityChecker::GetAvailableOccupationStatus(RULE_LEGALITY* pCrew) {
	// 首次检查需根据预占计算RDO参数
	if (this->_dbData->IsNeedPreAssignCache()) {
		this->CalRDOParamCache(pCrew);
		if (this->GetApplication() == ROSTER_OPTIMIZER) {
			this->_dbData->setNeedPreAssignCache(false);
		}
	}
	std::vector<std::vector<OccupationStatus>> statusVectorVec;
    CheckMinRestBetweenConsecutiveDaysRule *rule6011{nullptr};
    const auto& rules6011 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST_BETWEEN_CONSECUTIVE_DAYS);
    if (this->GetApplication() == ROSTER_OPTIMIZER && !rules6011.empty()) {
        rule6011 = _ruleFactory->GetCheckRule<CheckMinRestBetweenConsecutiveDaysRule>();
    }
	const auto& rules = this->_dbData->getRuleFunctions(RULES::MIN_CONSECUTIVE_RDO);
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	if (testCrews.find(crew->idCrew) != testCrews.end())
		int a = 0;
	if (exceptionList.find(crew->idCrew) != exceptionList.end())
		return statusVectorVec;
	bool partTimeCrew = std::any_of(crew->teamList.begin(), crew->teamList.end(), [](const SharedPtr<CREW_TEAM>& team) {
		return team->teamName == "CCPT" || team->teamName == "FCPT";
	});
	if(partTimeCrew)
		return statusVectorVec;
	const std::unordered_map<std::string, RDOParamCache>& crewIdToRDOParamCache = this->_dbData->GetRDOParamCacheMap();
	if (crewIdToRDOParamCache.find(crew->idCrew) == crewIdToRDOParamCache.end())
		return statusVectorVec;
	const auto& cache = crewIdToRDOParamCache.at(crew->idCrew);
	const auto& leadIn = cache.leadIn;
	const auto& leadOut = cache.multipleLeadOut < cache.singleLeadOut ? cache.multipleLeadOut : cache.singleLeadOut;
	const auto& minLength = cache.minLength;
	const auto& useDutyRest = cache.useDutyRest;
	const auto& countBlankDay = cache.countBlankDay;
	const auto& strRestAssignmentGroup = cache.strRestAssignmentGroup;
	std::vector<std::vector<unsigned char>> preferRDOs;
	std::vector<std::string> restAssignmentGroupList;
	if (this->GetApplication() == ROSTER_OPTIMIZER && !cache.legalPA)
		return statusVectorVec;
	if (this->GetApplication() == ROSTER_OPTIMIZER)
		preferRDOs = cache.isExceptRDO ? cache.exceptRDOs : cache.acceptRDOs;
	else {
		preferRDOs.reserve(cache.acceptRDOs.size() + cache.exceptRDOs.size());
		preferRDOs.insert(preferRDOs.end(), cache.acceptRDOs.begin(), cache.acceptRDOs.end());
		preferRDOs.insert(preferRDOs.end(), cache.exceptRDOs.begin(), cache.exceptRDOs.end());
	}
	// al天数
	int al_num = 0;
	int RDO_num = 0;
	int grey_num = 0;
	// 预占的u/a或grey天数
	int used_grey_num = 0;
	// 计算RP周期
	time_t rosterPeriodStart = 0, rosterPeriodEnd = 0;
	time_t scenarioStart, scenarioEnd;
	string defaultAirport = this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
	if (defaultAirport != "") {
		int timezoneOffsetMinutes = this->_dbData->getAirportOffsetMinutes(defaultAirport);
		scenarioStart = this->_dbData->scenario.startDtUTC + (time_t)(timezoneOffsetMinutes * 60);
		scenarioEnd = this->_dbData->scenario.endDtUTC + (time_t)(timezoneOffsetMinutes * 60);
	}
	// 如果是RO，直接用RO的开始结束时间
	if (this->GetApplication() == ROSTER_OPTIMIZER) {
		rosterPeriodStart = scenarioStart;
		rosterPeriodEnd = scenarioEnd + 24 * 3600;
	}
	// tracking 阶段需要根据rosterPeriod表计算
	//TODO 需确认如果live打开范围里不存在一个完整的RP周期该如何 
	// Tracking阶段至少包含一个完整的RP
	else {
		// 根据live的开始结束日期，得到日期范围内的RP
		for (auto& rp : this->_dbData->rosterPeriodList) {
			if (rp.rp_start >= scenarioStart && rp.rp_end <= scenarioEnd) {
				rosterPeriodStart = rp.rp_start;
				rosterPeriodEnd = rp.rp_end + 24 * 3600;
			}
		}
	}
	bool prevRosterLeadOut = false;
	time_t prevRosterEndTime = 0;
	const auto& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	vector<SharedPtr<ROSTER>> rosterInRange;
	unsigned char spanRPConsecutiveDays{ 0 };
	// 统计AL数量
	for (std::size_t i = 0; i < rosters.size(); i++) {
        auto isAL = find(cache.alAssignments.begin(), cache.alAssignments.end(), rosters[i]->duty) != cache.alAssignments.end();
		// 查找上一个RP的最后一个Roster
		if (rosters[i]->actStrLoc < rosterPeriodStart
			&& std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters[i]->qualifier) == cache.restAssignments.end()) {
			prevRosterEndTime = useDutyRest ? rosters[i]->actRestStrLoc : rosters[i]->actEndLoc;
		}
		if (rosters[i]->actStrLoc >= rosterPeriodStart && rosters[i]->actStrLoc < rosterPeriodEnd) {
			if (find(cache.unassignedAssignments.begin(), cache.unassignedAssignments.end(), rosters[i]->qualifier) != cache.unassignedAssignments.end()) used_grey_num++;
			rosterInRange.push_back(rosters[i]);
		}
		if (rosters[i]->actStrLoc < rosterPeriodEnd && rosters[i]->actRestStrLoc > rosterPeriodEnd
            && (!_dbData->isAssignmentInGroup(rosters.at(i)->qualifier, cache.RDOAssignment) && isAL && rosters[i]->qualifier != "SDO"))
			spanRPConsecutiveDays = static_cast<unsigned char>(ceil((double)(rosters[i]->actEndLoc - rosterPeriodEnd) / (3600.0 * 24.0)));
	}
	split(strRestAssignmentGroup, '|', restAssignmentGroupList);
	bool prevStartValid = true;
	std::vector<std::vector<OccupationStatus>> statusVectors = howManyRDOInRange(cache, this->_dbData, pCrew, rosterInRange, rosterPeriodStart, rosterPeriodEnd, prevRosterEndTime, restAssignmentGroupList, true, prevStartValid);

	// 设置Helper6001参数
	std::unique_ptr<Helper6001> helper6001 = std::make_unique<Helper6001>();
	helper6001->SetDefaultMaxConsecutiveDays(cache.maxConsecutiveTimes);
	helper6001->SetPreviousRosterPeriodMaxConsecutiveDays(cache.addMaxConsecutiveTimes);
	helper6001->SetExceptionMaxConsecutiveDays(cache.addMaxConsecutiveTimes, cache.addMaxNumber);
	helper6001->SetTotalNumRDONeeded(cache.maxNumRDONeeded);
	helper6001->SetPreviousConsecutiveDays(cache.previousConsecutiveDays);
	helper6001->SetLeadoutConsecutiveDays(spanRPConsecutiveDays);
	helper6001->SetInternalMultiThreading(this->_helper6001MT);
    if(cache.coveredWeekends){
        helper6001->AddMustCoverDays({ 5, 6 });
        helper6001->AddMustCoverDays({ 12, 13 });
        helper6001->AddMustCoverDays({ 19, 20 });
        helper6001->AddMustCoverDays({ 26, 27 });
    }
	for (auto& spacing : cache.minSpacingBetweenConsecutiveRDOs) {
		helper6001->SetMinSpacingBetweenConsecutiveRDOs(spacing);
		for (std::size_t ii = 0; ii < statusVectors.size(); ii++) {
			auto& statusVector = statusVectors[ii];
			std::bitset<Helper6001::RosterPeriodLength> uaSlot;
			for (int i = 0; i < Helper6001::RosterPeriodLength; i++) {
				if (i > 0 && statusVector.at(i - 1) == OccupationStatus::ANNUAL_LEAVE_OCCUPIED) {
					uaSlot.set(i, true);
				}
				if (statusVector.at(i) != OccupationStatus::UNASSIGNED_DAY_AVAILABLE
					&& statusVector.at(i) != OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE) {
					uaSlot.set(i, true);
				}
			}
			for (const auto& preferRDO : preferRDOs) {
				// 获得枚举结果
				auto enumerationRDO = helper6001->GetAllPossiblePattern(this->_dbData->GetHelper6001Cache(), statusVector, preferRDO);
				if (!enumerationRDO.empty()) {
					// 遍历所有枚举结果
					for (const auto& solution : enumerationRDO) {
                        if (!CheckRDOLengthAndLeadOutLegality(solution, rosters, cache, rosterPeriodStart,
                                                              rosterPeriodEnd, pCrew)
                            || !CheckALBlockLegality(solution, rosters, cache, rosterPeriodStart)
                            || !CheckAnnualLeaveRDO(solution, rosters, rosterPeriodStart, cache)
                            || (rule6011 && !rule6011->CheckRuleWithRDOPattern(rosters, solution, rosterPeriodStart)))
                            continue;
                        //SetGreyDayLeadOutAvailable(solution, rosters, uaSlot, cache, rosterPeriodStart);
                        std::bitset<Helper6001::RosterPeriodLength> uaSlotTemp = uaSlot;
                        if(crew->division == "P"){
                            SetGreyDayAvailableTemp(solution, rosters, uaSlotTemp, cache, rosterPeriodStart);
                            SetGreyDayLeadOutAvailable(solution, rosters, uaSlotTemp, cache, rosterPeriodStart);
                        }
						std::vector<OccupationStatus> statusVectorTemp(statusVector);
						// 加上预占的ua/grey
						int ua_used_count = used_grey_num;
						bool check = false;
						const auto& occupiedBitset = solution | uaSlotTemp;
						int occupied = (int)occupiedBitset.count();
						// 判断剩余天数是否满足UA天数
						if (static_cast<int>(Helper6001::RosterPeriodLength) - occupied >= cache.unassignedDays - ua_used_count) {
							std::bitset<Helper6001::RosterPeriodLength> uaOccupied;
							// 寻找RDO前后是否可以排UA
							// 优先考虑RDO前
							for (std::size_t i = 0; i < Helper6001::RosterPeriodLength; ++i) {
								if (ua_used_count >= cache.unassignedDays) {
									check = true;
									break;
								}
								if (!occupiedBitset.test(i)
									&& statusVectorTemp.at(i) != OccupationStatus::SUBSTITUTED_DAYS_OFF_PRE_ASSIGNMENT
									&& statusVectorTemp.at(i) != OccupationStatus::ANNUAL_LEAVE_OCCUPIED) {
									if (i != Helper6001::RosterPeriodLength - 1 && solution.test(i + 1)) {
										uaOccupied.set(i, true);
										++ua_used_count;
									}
								}
							}
							// 再考虑RDO后
							for (std::size_t i = 0; i < Helper6001::RosterPeriodLength; ++i) {
								if (ua_used_count >= cache.unassignedDays) {
									check = true;
									break;
								}
								if (!uaOccupied.test(i) && !occupiedBitset.test(i)
									&& statusVectorTemp.at(i) != OccupationStatus::SUBSTITUTED_DAYS_OFF_PRE_ASSIGNMENT
									&& statusVectorTemp.at(i) != OccupationStatus::ANNUAL_LEAVE_OCCUPIED) {
									if (i != 0 && solution.test(i - 1)) {
										uaOccupied.set(i, true);
										++ua_used_count;
									}
								}
							}
							// 目前没有强制要求UA在RDO前后，暂时UA天数满足就返回true  2023.11.15 jiaxin.jin
							check = true;
							// 填充UA和RDO
							for (std::size_t i = 0; i < Helper6001::RosterPeriodLength; ++i) {
								if (ua_used_count < cache.unassignedDays) {
									if (!occupiedBitset.test(i) && !uaOccupied.test(i)
										&& statusVectorTemp.at(i) != OccupationStatus::SUBSTITUTED_DAYS_OFF_PRE_ASSIGNMENT
										&& statusVectorTemp.at(i) != OccupationStatus::ANNUAL_LEAVE_OCCUPIED) {
										statusVectorTemp.at(i) = OccupationStatus::UNASSIGNED_DAY_OCCUPIED;
										++ua_used_count;
									}
								}
								if (uaOccupied.test(i)) {
									statusVectorTemp.at(i) = OccupationStatus::UNASSIGNED_DAY_OCCUPIED;
								}
								if (solution.test(i)
									&& statusVectorTemp.at(i) != OccupationStatus::SUBSTITUTED_DAYS_OFF_PRE_ASSIGNMENT
									&& statusVectorTemp.at(i) != OccupationStatus::ANNUAL_LEAVE_OCCUPIED) {
									statusVectorTemp.at(i) = OccupationStatus::ROSTER_DAYS_OFF_OCCUPIED;
								}
							}
							if (check) {
								statusVectorVec.push_back(statusVectorTemp);
							}
						}
					}
				}
			}
		}
		if (!statusVectorVec.empty()) break;
	}

	return statusVectorVec;
}

bool LegalityChecker::checkMinConsecutiveRosterDaysOff(RULE_LEGALITY* pCrew) {

	const auto& rules = this->_dbData->getRuleFunctions(RULES::MIN_CONSECUTIVE_RDO);
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	time_t scenarioStart = RosterUtils::GetScenarioStartLoc(crew, this->getDataContext());
	time_t scenarioEnd = RosterUtils::GetScenarioEndLoc(crew, this->getDataContext());
	// 如果是RO，直接用RO的开始结束时间
	if (this->GetApplication() == ROSTER_OPTIMIZER) {
		// 首次检查需根据预占计算RDO参数
		if (this->_dbData->IsNeedPreAssignCache()) {
			this->CalRDOParamCache(pCrew);
			this->_dbData->setNeedPreAssignCache(false);
		}
		const std::unordered_map<std::string, RDOParamCache>& crewIdToRDOParamCache = this->_dbData->GetRDOParamCacheMap();
		if (crewIdToRDOParamCache.find(crew->idCrew) == crewIdToRDOParamCache.end())
			return false;
		const auto& cache = crewIdToRDOParamCache.at(crew->idCrew);
		time_t rosterPeriodStart = scenarioStart;
		time_t rosterPeriodEnd = scenarioEnd + 24 * 3600;
		if (cache.excludingTeams.size() > 0 && cache.excludingTeams != "*" && Utility::GetInstancePtr()->isCrewTeamQualified(crew, cache.excludingTeams, rosterPeriodStart, rosterPeriodEnd))
			return true;
		return this->CheckMinConsecutiveRosterDaysOffByRosterPeriod(pCrew, rosterPeriodStart, rosterPeriodEnd, true, cache);
	}
	// tracking 阶段需要根据rosterPeriod表计算
	//TODO 需确认如果live打开范围里不存在一个完整的RP周期该如何 
	// Tracking阶段至少包含一个完整的RP
	else {
		// 根据live的开始结束日期，得到日期范围内的RP
		for (auto& rp : this->_dbData->rosterPeriodList) {
			if (rp.rp_end < scenarioStart || rp.rp_start > scenarioEnd)
				continue;
			bool isFullRP = false;//RP整个时间段是否在场景内
			if ( rp.rp_start >= scenarioStart && rp.rp_end < scenarioEnd ) {
				isFullRP = true;
			}
				
			// 计算RP周期
			time_t rosterPeriodStart = rp.rp_start;
			time_t rosterPeriodEnd = rp.rp_end + 24 * 3600;

			this->_dbData->clearRDOParamCacheMap();
			this->CalRDOParamCache(pCrew, rosterPeriodStart, rosterPeriodEnd);
			const std::unordered_map<std::string, RDOParamCache>& crewIdToRDOParamCache = this->_dbData->GetRDOParamCacheMap();
			if (crewIdToRDOParamCache.find(crew->idCrew) == crewIdToRDOParamCache.end())
				continue;

			const auto& cache = crewIdToRDOParamCache.at(crew->idCrew);

			if (cache.excludingTeams.size() > 0 && cache.excludingTeams != "*" && Utility::GetInstancePtr()->isCrewTeamQualified(crew, cache.excludingTeams, rosterPeriodStart, rosterPeriodEnd))
				continue;

			this->CheckMinConsecutiveRosterDaysOffByRosterPeriod(pCrew, rosterPeriodStart, rosterPeriodEnd, isFullRP, cache);
		}
	}
	
	return false;
}

bool LegalityChecker::CheckMinConsecutiveRosterDaysOffByRosterPeriod(RULE_LEGALITY* pCrew, time_t checkStartLoc, time_t checkEndLoc, const bool isFullRP, const RDOParamCache cache) {
	std::vector<std::vector<unsigned char>> preferRDOs;
	std::vector<std::string> restAssignmentGroupList;
    CheckMinRestBetweenConsecutiveDaysRule *rule6011{nullptr};
    const auto& rules6011 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST_BETWEEN_CONSECUTIVE_DAYS);
    if (this->GetApplication() == ROSTER_OPTIMIZER && !rules6011.empty()) {
        rule6011 = _ruleFactory->GetCheckRule<CheckMinRestBetweenConsecutiveDaysRule>();
    }
	if (this->GetApplication() == ROSTER_OPTIMIZER && !cache.legalPA) {
		return false;
	}
	//RO二者之一，手动检查合并
	if (this->GetApplication() == ROSTER_OPTIMIZER)
		preferRDOs = cache.isExceptRDO ? cache.exceptRDOs : cache.acceptRDOs;
	else {
		preferRDOs.reserve(cache.acceptRDOs.size() + cache.exceptRDOs.size());
		preferRDOs.insert(preferRDOs.end(), cache.acceptRDOs.begin(), cache.acceptRDOs.end());
		preferRDOs.insert(preferRDOs.end(), cache.exceptRDOs.begin(), cache.exceptRDOs.end());
	}
	// al天数
	int RDO_num = 0;
	int grey_num = 0;
	// 预占的u/a或grey天数
	int used_grey_num = 0;
	const auto& rules = this->_dbData->getRuleFunctions(RULES::MIN_CONSECUTIVE_RDO);
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	const auto& leadIn = cache.leadIn;
	const auto& leadOut = cache.multipleLeadOut < cache.singleLeadOut ? cache.multipleLeadOut : cache.singleLeadOut;
	const auto& minLength = cache.minLength;
	const auto& useDutyRest = cache.useDutyRest;
	const auto& countBlankDay = cache.countBlankDay;
	const auto& strRestAssignmentGroup = cache.strRestAssignmentGroup;
	bool prevRosterLeadOut = false;
	time_t prevRosterEndTime = 0;
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.empty()) {
		return true;
	}
	vector<SharedPtr<ROSTER>> rosterInRange;
	unsigned char spanRPConsecutiveDays{ 0 };
	std::map<std::string, int> uaGreyUsedMap{};
	// 统计AL数量
	for (std::size_t i = 0; i < rosters.size(); i++) {
        auto isAL = find(cache.alAssignments.begin(), cache.alAssignments.end(), rosters[i]->duty) != cache.alAssignments.end();
		// 查找上一个RP的最后一个Roster
		if (rosters[i]->actStrLoc < checkStartLoc
			&& std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters[i]->qualifier) == cache.restAssignments.end()) {
			prevRosterEndTime = useDutyRest ? rosters[i]->actRestStrLoc : rosters[i]->actEndLoc;
		}
		if ((rosters[i]->actStrLoc >= checkStartLoc && rosters[i]->actStrLoc < checkEndLoc) || (rosters[i]->actRestStrLoc >= checkStartLoc && rosters[i]->actRestStrLoc < checkEndLoc)) {
			if (find(cache.unassignedAssignments.begin(), cache.unassignedAssignments.end(), rosters[i]->qualifier) != cache.unassignedAssignments.end()) used_grey_num++;
			// 统计ua/grey map
			if (!cache.unassignedPatterns.empty()) {
				if (cache.unassignedPatterns.find(rosters[i]->qualifier) != cache.unassignedPatterns.end()) {
					if (uaGreyUsedMap.find(rosters[i]->qualifier) == uaGreyUsedMap.end()) {
						uaGreyUsedMap[rosters[i]->qualifier] = 1;
					}
					else {
						uaGreyUsedMap[rosters[i]->qualifier]++;
					}
				}
			}
			rosterInRange.push_back(rosters[i]);
		}
		if (rosters[i]->actStrLoc < checkEndLoc && rosters[i]->actRestStrLoc > checkEndLoc
            && (!_dbData->isAssignmentInGroup(rosters.at(i)->qualifier, cache.RDOAssignment) && isAL && rosters[i]->qualifier != "SDO"))
			spanRPConsecutiveDays = static_cast<unsigned char>(ceil((double)(rosters[i]->actEndLoc - checkEndLoc) / (3600.0 * 24.0)));
	}
	if (rosterInRange.empty()) {
		return true;
	}
	split(strRestAssignmentGroup, '|', restAssignmentGroupList);
	bool prevStartValid = true;
	std::vector<std::vector<OccupationStatus>> statusVectors = howManyRDOInRange(cache, this->_dbData, pCrew, rosterInRange, checkStartLoc, checkEndLoc, prevRosterEndTime, restAssignmentGroupList, true, prevStartValid);
	if (!prevStartValid) {
		if (this->GetApplication() == ROSTER_OPTIMIZER) {
			return false;
		}
		// 输出违规信息
		//string msg = "RDO should cover the time range  " + TimeUtils::MinutesTohhmm(leadIn / 60)
		//	+ " to " + TimeUtils::MinutesTohhmm(leadOut / 60);
		//pCrew->legalMessage.push_back(msg);
		//this->setLegalityMessage(pCrew, pCrew, &rules[0], msg);
		//pCrew->isLegal = false;
		//RULE_VIOLATION* rv = new RULE_VIOLATION();
		//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
		//rv->startDTUtc = checkStartLoc;
		//rv->endDTUtc = checkEndLoc;
		//rv->violation_msg = msg;
		//rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		////OP#1448提供message参数给gantt
		////rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
		//this->addRuleViolations(rv, &rules[0]);
	}
	// 设置Helper6001参数
	std::unique_ptr<Helper6001> helper6001 = std::make_unique<Helper6001>();
	helper6001->SetDefaultMaxConsecutiveDays(cache.maxConsecutiveTimes);
	helper6001->SetPreviousRosterPeriodMaxConsecutiveDays(cache.addMaxConsecutiveTimes);
	helper6001->SetExceptionMaxConsecutiveDays(cache.addMaxConsecutiveTimes, cache.addMaxNumber);
	helper6001->SetTotalNumRDONeeded(cache.maxNumRDONeeded);
	helper6001->SetPreviousConsecutiveDays(cache.previousConsecutiveDays);
	helper6001->SetLeadoutConsecutiveDays(spanRPConsecutiveDays);
	helper6001->SetInternalMultiThreading(this->_helper6001MT);
    if(cache.coveredWeekends){
        helper6001->AddMustCoverDays({ 5, 6 });
        helper6001->AddMustCoverDays({ 12, 13 });
        helper6001->AddMustCoverDays({ 19, 20 });
        helper6001->AddMustCoverDays({ 26, 27 });
    }
	for (auto& spacing : cache.minSpacingBetweenConsecutiveRDOs) {
		helper6001->SetMinSpacingBetweenConsecutiveRDOs(spacing);
		for (std::size_t ii = 0; ii < statusVectors.size(); ii++) {
			bool check = false;
			std::bitset<Helper6001::RosterPeriodLength> uaSlot;
			std::bitset<Helper6001::RosterPeriodLength> rdoSlot;
			auto& statusVector = statusVectors[ii];
			int rdo_avaliable = 0;
			for (int i = 0; i < Helper6001::RosterPeriodLength; i++) {
				if (i > 0 && statusVector.at(i - 1) == OccupationStatus::ANNUAL_LEAVE_OCCUPIED) {
					uaSlot.set(i, true);
				}
				if (statusVector.at(i) != OccupationStatus::UNASSIGNED_DAY_AVAILABLE
					&& statusVector.at(i) != OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE) {
					uaSlot.set(i, true);
				}
				if (statusVector.at(i) == OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE || statusVector.at(i) == OccupationStatus::ROSTER_DAYS_OFF_OCCUPIED)
					++rdo_avaliable;
				if (statusVector.at(i) == OccupationStatus::ROSTER_DAYS_OFF_OCCUPIED || statusVector.at(i) == OccupationStatus::SUBSTITUTED_DAYS_OFF_PRE_ASSIGNMENT)
					rdoSlot.set(i, true);
			}
			int rdoNum = (int)rdoSlot.count();
			if (this->GetApplication() == ROSTER_OPTIMIZER)
                rdoNum = rdo_avaliable;
			if (isFullRP && rdoNum < cache.minNumRDONeeded) {
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				//告警
				string msg = "The number of RDO must be at least {0:minNumRDONeededHHmm}.";
				msg = StringUtils::Format(msg, Utility::GetInstancePtr()->ToString(cache.minNumRDONeeded));

				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, &rules[0], msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = checkStartLoc;
				rv->endDTUtc = checkEndLoc;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
				this->addRuleViolations(rv, &rules[0]);
			}

			for (const auto& preferRDO : preferRDOs) {
				// 获得枚举结果
				auto enumerationRDO = helper6001->GetAllPossiblePattern(this->_dbData->GetHelper6001Cache(), statusVector, preferRDO);
				// live 只检查已分配RDO的前后任务
				if (this->GetApplication() != ROSTER_OPTIMIZER) {
					enumerationRDO.clear();
					enumerationRDO.push_back(rdoSlot);
				}
				if (!enumerationRDO.empty()) {
					bool uaFIx = false;
					// 遍历所有枚举结果
					for (const auto& solution : enumerationRDO) {
						if (!CheckRDOLengthAndLeadOutLegality(solution, rosters, cache, checkStartLoc, checkEndLoc, pCrew, &rules[0], true)) {
							continue;
						}
						if (!CheckALBlockLegality(solution, rosters, cache, checkStartLoc))
							continue;
						if (!CheckAnnualLeaveRDO(solution, rosters, checkStartLoc, cache))
							continue;
                        if (rule6011 && !rule6011->CheckRuleWithRDOPattern(rosters, solution, checkStartLoc))
                            continue;
                        //SetGreyDayLeadOutAvailable(solution, rosters, uaSlot, cache, rosterPeriodStart);
                        std::bitset<Helper6001::RosterPeriodLength> uaSlotTemp = uaSlot;
                        if(crew->division == "P"){
                            SetGreyDayAvailableTemp(solution, rosters, uaSlotTemp, cache, checkStartLoc);
                            SetGreyDayLeadOutAvailable(solution, rosters, uaSlotTemp, cache, checkStartLoc);
                        }
						/*if (this->GetApplication() == ROSTER_OPTIMIZER
							&& !CheckBlankDayNum(solution, rosters, cache, rosterPeriodStart, cache.unassignedDays - used_grey_num))
							continue;*/
							// 加上预占的ua/grey
						int ua_used_count = used_grey_num;
						const auto& occupiedBitset = solution | uaSlotTemp;
						int occupied = (int)occupiedBitset.count();
						if (!cache.unassignedPatterns.empty()) {
							bool fixPattern = true;
							//对比usedMap和参数
							for (const auto& pattern : cache.unassignedPatterns) {
								if (uaGreyUsedMap.find(pattern.first) == uaGreyUsedMap.end() || uaGreyUsedMap[pattern.first] < pattern.second) {
									fixPattern = false;
									//不满足条件，跳出
									break;
								}
								
							}
							//used 不满足条件，查看空白天是否满足
							if (!fixPattern) {
								//统计对比参数还需要几天空白天
								int needCount = 0;
								for (const auto& pair : cache.unassignedPatterns) {
									if (uaGreyUsedMap.find(pair.first) == uaGreyUsedMap.end())
										needCount += pair.second;
									else if (pair.second > uaGreyUsedMap[pair.first])
										needCount += pair.second - uaGreyUsedMap[pair.first];
								}
								if (static_cast<int>(Helper6001::RosterPeriodLength) - occupied >= needCount)
									fixPattern = true;
							}
							uaFIx = fixPattern;
							
						}
						else {
							// 判断剩余天数是否满足UA天数
							if (static_cast<int>(Helper6001::RosterPeriodLength) - occupied >= cache.unassignedDays - ua_used_count) {
								uaFIx = true;
								// 寻找RDO前后是否可以排UA
								for (std::size_t i = 0; i < Helper6001::RosterPeriodLength; ++i) {
									if (ua_used_count >= cache.unassignedDays) {
										check = true;
										break;
									}
									if (!occupiedBitset.test(i)) {
										if (i != 0 && i != Helper6001::RosterPeriodLength - 1 && (solution.test(i - 1) || solution.test(i + 1))) {
											++ua_used_count;
										}
									}
								}
								// 目前没有强制要求UA在RDO前后，暂时UA天数满足就返回true  2023.11.15 jiaxin.jin
								check = true;
								break;
							}
						}
						
					}
					if (!uaFIx) {
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}
						string msg = "";
						if (cache.unassignedPatterns.empty()) {
							//告警
							msg = "The number of U/A or Grey must be at least {0:minNumUANeededHHmm}.";
							msg = StringUtils::Format(msg, Utility::GetInstancePtr()->ToString(cache.unassignedDays));

						}
						else {
							for (const auto& pattern : cache.unassignedPatterns) {
								msg += "The number of {0:assignment} must be at least {1:number}.";
								msg = StringUtils::Format(msg, pattern.first, Utility::GetInstancePtr()->ToString(pattern.second));
							}
						}
						
						pCrew->legalMessage.push_back(msg);
						this->setLegalityMessage(pCrew, pCrew, &rules[0], msg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
						rv->startDTUtc = checkStartLoc;
						rv->endDTUtc = checkEndLoc;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						//OP#1448提供message参数给gantt
						//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
						this->addRuleViolations(rv, &rules[0]);
					}
				}
				if (check) return true;
			}
			//bool check = true;
		//vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
		//if (rosters.empty()) {
		//	return true;
		//}
		//const auto & statusVector = GetAvailableOccupationStatus(rosters);
		//if (statusVector.empty()) {
		//	check = false;
		//}
		}
	}
	if (statusVectors.empty()) {
		return true;
	}
	return false;
}

void LegalityChecker::CalRDOParamCache(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
		return;
	const auto& crew = this->_dbData->crewList[pCrew->crewIndex];
	time_t windowStartLoc = RosterUtils::GetScenarioStartLoc(crew, this->getDataContext());
	time_t windowEndLoc = RosterUtils::GetScenarioEndLoc(crew, this->getDataContext());
	CalRDOParamCache(pCrew, windowStartLoc, windowEndLoc);
}

void LegalityChecker::CalRDOParamCache(RULE_LEGALITY* pCrew, const time_t windowStartLoc, const time_t windowEndLoc)
{
	if (pCrew->crewIndex < 0)
		return;
	const auto& currentCrew = this->_dbData->crewList[pCrew->crewIndex];
	const auto& crews = this->_dbData->crewList;
	const auto& rules = this->_dbData->getRuleFunctions(RULES::MIN_CONSECUTIVE_RDO);
	const auto& rules6115 = this->_dbData->getRuleFunctions(RULES::MAX_CONSECUTIVE_DUTY_DAYS_QQ);
	const auto& rules6010 = this->_dbData->getRuleFunctions(RULES::LIMIT_BEFORE_ANNUAL_LEAVE);
    const auto& rules6011 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST_BETWEEN_CONSECUTIVE_DAYS);
    CheckMinRestBetweenConsecutiveDaysRule *rule6011{nullptr};
    if (this->GetApplication() == ROSTER_OPTIMIZER && !rules6011.empty()) {
        rule6011 = _ruleFactory->GetCheckRule<CheckMinRestBetweenConsecutiveDaysRule>();
    }
	// 读取6010数据
	for (auto& singleRule : rules6010) {
		auto& parameter = singleRule.params;
		string header, headeValue;
		string strBase, strRank, strFleet;
		std::vector<std::string> blockAssignments;
		for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
			header = iter->first;
			headeValue = iter->second;
			if (header == "ASSIGNMENTS")
				split(headeValue, '|', blockAssignments);
			else if (header == "MIN PERIOD DAYS")
				RDOParamCache::blockDayNum = stoi(headeValue);
			else if (header == "CHECK OUT REFERENCE TIME")
				RDOParamCache::blockCheckOut = hhmmToMinutes(headeValue.c_str()) * 60;
			else if (header == "CHECK IN REFERENCE TIME")
				RDOParamCache::blockCheckIn = hhmmToMinutes(headeValue.c_str()) * 60;
		}
		for (auto& blockAssignment : blockAssignments)
			RDOParamCache::blockAssignments.emplace(blockAssignment);
		break;
	}
	Helper6001::SetMatchPatternMemPoolSize(20);
	auto GetRDOList = [](std::string& text, std::vector<std::vector<unsigned char>>& rdos, unsigned char& totalNumRDONeeded, unsigned char& minNumRDONeeded,unsigned char& maxContinueRDONum) {
		vector<string> strList;
		split(text, '|', strList);
		rdos.clear();
		for (const auto& strPattern : strList) {
			vector<string> rdoPattern;
			split(strPattern.c_str(), '+', rdoPattern);
			vector<unsigned char> rdoChar;
			unsigned char curNumRDONeeded{ 0 };
			rdoChar.reserve(rdoPattern.size());
			for (const auto& strRDO : rdoPattern) {
				if (maxContinueRDONum < stoi(strRDO))
					maxContinueRDONum = stoi(strRDO);
				rdoChar.emplace_back(stoi(strRDO));
				curNumRDONeeded += stoi(strRDO);
			}
			totalNumRDONeeded = curNumRDONeeded > totalNumRDONeeded ? curNumRDONeeded : totalNumRDONeeded;
			minNumRDONeeded = curNumRDONeeded < minNumRDONeeded ? curNumRDONeeded : minNumRDONeeded;
			std::stable_sort(rdoChar.begin(), rdoChar.end());
			rdos.emplace_back(rdoChar);
		}
	};
	for (const auto& crew : crews) {
		if (this->GetApplication() != ROSTER_OPTIMIZER && currentCrew->idCrew != crew->idCrew)
			continue;
		RDOParamCache cache;
		if (testCrews.find(crew->idCrew) != testCrews.end())
			int a = 0;

		long leadIn = 0;
		long multipleLeadOut = 0;
		long singleLeadOut = 0;
		// al天数
		int al_num = 0;
		long minLength = 0;
		int RDO_num = 0;
		int grey_num = 0;
		int max_grey_num = 0;
		// 预占的u/a或grey天数
		int used_grey_num = 0;
		string RDO_main, preferred, notPreferred;
		vector<RosterPeriod> rosterPeriods;
		std::pair<std::vector<std::vector<unsigned char>>, std::vector<std::vector<unsigned char>>> rstRDOPair;
		vector<vector<unsigned char>> acceptRDOs;
		vector<vector<unsigned char>> exceptRDOs;
		unsigned char maxContinueRDONum = 0;
		string preferredRDOsText = "2+2+2+2"; // 默认2,2,2,2组合
		string acceptRDOsText;
		string exceptRDOsText;
		vector<string> restAssignmentGroupList;
		vector<string> restAssignmentList;
		string strRestAssignmentGroup, strRestAssignment, strCoveredWeekends, strExcludingTeams = "*";
		// 计算RP周期
		time_t rosterPeriodStart = 0, rosterPeriodEnd = 0;
		time_t scenarioStart = windowStartLoc, scenarioEnd = windowEndLoc;
		// 如果是RO，直接用RO的开始结束时间
		if (this->GetApplication() == ROSTER_OPTIMIZER) {
			rosterPeriodStart = scenarioStart;
			rosterPeriodEnd = scenarioEnd + 24 * 3600;
		}
		// tracking 阶段需要根据rosterPeriod表计算
		//TODO 需确认如果live打开范围里不存在一个完整的RP周期该如何 
		// Tracking阶段至少包含一个完整的RP
		else {
			// 根据live的开始结束日期，得到日期范围内的RP
			for (auto& rp : this->_dbData->rosterPeriodList) {
				if (rp.rp_start >= scenarioStart && rp.rp_end <= scenarioEnd) {
					rosterPeriodStart = rp.rp_start;
					rosterPeriodEnd = rp.rp_end + 24 * 3600;
				}
			}
		}
		bool prevRosterLeadOut = false;
		time_t prevRosterEndTime = 0;
		vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
		vector<SharedPtr<ROSTER>> rosterInRange;
		vector<string> alAssignments;
		string rdoAssignment, greyAssignment, unassignedAssignment, unassignedPatternStr;
		std::map<std::string, int> unassignedPatterns;
		//int minSpacingBetweenConsecutiveRDOs{ 0 };
		std::string minSpacingBetweenConsecutiveRDOs = "1";
		std::vector<std::string> minSpacingBetweenConsecutiveRDOsVec;
		std::vector<int> minSpacingBetweenConsecutiveRDOsIntVec;
		int minSpacing = INT_MAX;
		for (auto& singleRule : rules) {
			auto& parameter = singleRule.params;
			string header, headeValue;
			for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
				header = iter->first;
				headeValue = iter->second;
				if (singleRule.tableNum == 1) {
					if (header == "RDO LEAD IN") {
						leadIn = hhmmToMinutes(headeValue.c_str()) * 60;
					}
					else if (header == "MULTIPLE RDO LEAD OUT") {
						multipleLeadOut = hhmmToMinutes(headeValue.c_str()) * 60;
					}
					else if (header == "SINGLE RDO LEAD OUT") {
						singleLeadOut = hhmmToMinutes(headeValue.c_str()) * 60;
					}
					else if (header == "RDO MAIN") {
						RDO_main = headeValue;
					}
					else if (header == "EXTENDED LENGTH") {
						minLength = hhmmToMinutes(headeValue.c_str()) * 60;
					}
					else if (header == "ASSIGNMENT GROUP AS RDO LENGTH") {

					}
					else if (header == "ASSIGNMENT AS RDO LENGTH") {

					}
					else if (header == "ANNUAL LEAVE ASSIGNMENTS") {        //列名废弃，改成Group
						split(headeValue, '|', alAssignments);
					}
                    else if (header == "ANNUAL LEAVE ASSIGNMENT GROUPS") {
						split(headeValue, '|', alAssignments);
					}
					else if (header == "RDO ASSIGNMENT") {
						rdoAssignment = headeValue;
					}
					else if (header == "RDO SPACE") {
						minSpacingBetweenConsecutiveRDOs = headeValue;
					}
					else if (header == "UNASSIGNED DAY ASSIGNMENT") {
						unassignedAssignment = headeValue;
					}
					else if (header == "IGNORE LENGTH CHECK ASSIGNMENT") {
						strRestAssignment = headeValue;
					}
					else if (header == "IGNORE LENGTH CHECK ASSIGNMENT GROUP") {
						strRestAssignmentGroup = headeValue;
					}
					else if (header == "COVERED WEEKENDS") {
						strCoveredWeekends = headeValue;
					}
					else if (header == "EXCLUDING TEAMS") {
						strExcludingTeams = headeValue;
					}
				}

			}
		}
		split(strRestAssignmentGroup, '|', restAssignmentGroupList);
		split(strRestAssignment, '|', restAssignmentList);
		for (auto& group : restAssignmentGroupList) {
			const auto& assignStrVec = _dbData->getAssignmentsInGroup(group);
			restAssignmentList.insert(restAssignmentList.end(), assignStrVec.begin(), assignStrVec.end());
		}
		cache.restAssignments = restAssignmentList;
		cache.strRestAssignmentGroup = strRestAssignmentGroup;
		cache.coveredWeekends = strCoveredWeekends == "Y";
		cache.excludingTeams = strExcludingTeams;
        cache.alAssignments = alAssignments;
		split(unassignedAssignment, '|', cache.unassignedAssignments);
		//统计本RP跨到下一个RP的连续工作(非RDO)天数
		//RDO hardcode: AL、SDO、RDO
		//TODO: 考虑下一个RP的PA
		unsigned char spanRPConsecutiveDays{ 0 };
        std::vector<long long> alDays;
		// 统计AL数量
		for (std::size_t i = 0; i < rosters.size(); i++) {
            auto isAL = find(cache.alAssignments.begin(), cache.alAssignments.end(), rosters[i]->duty) != cache.alAssignments.end();
            if (isAL) {
                auto day = (rosters[i]->actStrLoc - rosterPeriodStart) / daySeconds;
                if (rosters[i]->actStrLoc < rosterPeriodStart &&
                    (rosterPeriodStart - rosters[i]->actStrLoc) % daySeconds != 0)
                    day--;
                alDays.emplace_back(day);
            }
			// 查找上一个RP的最后一个Roster
			if (rosters[i]->actStrLoc < rosterPeriodStart
				&& std::find(cache.restAssignments.begin(), cache.restAssignments.end(), rosters[i]->qualifier) == cache.restAssignments.end()) {
				prevRosterEndTime = rosters[i]->actRestStrLoc;
			}
			if (rosters[i]->actStrLoc >= rosterPeriodStart && rosters[i]->actStrLoc < rosterPeriodEnd) {
				if (isAL) {
					time_t alStartTime = rosters[i]->actStrLoc < rosterPeriodStart ? rosterPeriodStart : rosters[i]->actStrLoc;
					time_t alEndTime = rosters[i]->actRestStrLoc > rosterPeriodEnd ? rosterPeriodEnd : rosters[i]->actRestStrLoc;
					al_num += TimeUtils::DiffCalendarDay(alStartTime, alEndTime);
				}
				if (find(cache.unassignedAssignments.begin(), cache.unassignedAssignments.end(), rosters[i]->qualifier) != cache.unassignedAssignments.end()) used_grey_num++;
				rosterInRange.push_back(rosters[i]);
			}
			if (rosters[i]->actStrLoc < rosterPeriodEnd && rosters[i]->actRestStrLoc > rosterPeriodEnd
				&& (!_dbData->isAssignmentInGroup(rosters[i]->qualifier, cache.RDOAssignment) && isAL && rosters[i]->qualifier != "SDO"))
				spanRPConsecutiveDays = static_cast<unsigned char>(ceil((double)(rosters[i]->actStrLoc - rosterPeriodEnd) / (3600.0 * 24.0)));
		}
        // al已经覆盖周末，则不需要再额外使用RDO覆盖
        if (cache.coveredWeekends) {
            std::vector<std::set<long long>> weekends = {
                    {5,  6},
                    {12, 13},
                    {19, 20},
                    {26, 27}
            };
            // 查找连续的AL日期
            int minConsecutiveALDay = 5;        // 暂时hardcode
            int consecutiveALCount = 0;
            std::unordered_set<long long> consecutiveALDaysCur;
            std::unordered_set<long long> consecutiveALDays;
            for (size_t i = 0; i < alDays.size(); ++i) {
                if (i == 0 || alDays[i - 1] == alDays[i] - 1) {
                    consecutiveALCount++;
                    if (alDays[i] >= 0 && alDays[i] < Helper6001::RosterPeriodLength)
                        consecutiveALDaysCur.insert(alDays[i]);
                } else {
                    if (consecutiveALCount >= minConsecutiveALDay) {
                        // 如果找到连续的AL，记录下来
                        consecutiveALDays.insert(consecutiveALDaysCur.begin(), consecutiveALDaysCur.end());
                    }
                    consecutiveALCount = 1; // 重置计数
                    consecutiveALDaysCur.clear();
                    consecutiveALDaysCur.insert(alDays[i]); // 添加当前日期
                }
            }
            // 检查最后一组
            if (consecutiveALCount >= minConsecutiveALDay) {
                consecutiveALDays.insert(consecutiveALDaysCur.begin(), consecutiveALDaysCur.end());
            }
            auto alCovered = std::any_of(weekends.begin(), weekends.end(),
                                         [&consecutiveALDays](const std::set<long long> &weekend) {
                                             return std::all_of(weekend.begin(), weekend.end(),
                                                                [&consecutiveALDays](const long long &day) {
                                                                    return consecutiveALDays.count(day) > 0;
                                                                });
                                         });
            if (alCovered)
                cache.coveredWeekends = false;
        }
		unsigned char totalNumRDONeeded{ 0 };
		unsigned char minNumRDONeeded{ Helper6001::RosterPeriodLength };
		for (auto& singleRule : rules) {
			auto& parameter = singleRule.params;
			string header, headeValue;
			string strBase, strRank, strFleet, strTeams;
			string rdoAssignment, greyAssignment;
			vector<string> alAssignments;
			int approvedLeaveDays = 0, unassignedDay = 0, maxUnassignedDay = 0;
			for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
				header = iter->first;
				headeValue = iter->second;
				if (singleRule.tableNum == 2) {

					if (header == "BASES") {
						strBase = headeValue;
					}
					else if (header == "RANKS") {
						strRank = headeValue;
					}
					else if (header == "FLEETS") {
						strFleet = headeValue;
					}
					else if (header == "CREW TEAMS") {
						strTeams = headeValue;
					}
					else if (header == "APPROVED ANNUAL LEAVE DAYS") {
						approvedLeaveDays = stoi(headeValue);
					}
					else if (header == "UNASSIGNED DAY") {
						std::vector<std::string> unassignedDayRangeStr;
						std::vector<int> unassignedDayRange;
						split(headeValue, '-', unassignedDayRangeStr);
						for (auto& s : unassignedDayRangeStr) {
							unassignedDayRange.emplace_back(stoi(s));
						}
						if (!unassignedDayRange.empty()) {
							unassignedDay = *std::min_element(unassignedDayRange.begin(), unassignedDayRange.end());
							maxUnassignedDay = *std::max_element(unassignedDayRange.begin(), unassignedDayRange.end());
						}
					}
					else if (header == "ACCEPTABLE RDO COMPOSITIONS") {
						acceptRDOsText = headeValue;
					}
					else if (header == "EXCEPTIONAL RDO COMPOSTIONS") {
						exceptRDOsText = headeValue;
					}
                    else if (header == "UNASSIGN PATTERN") {
                        unassignedPatternStr = headeValue;
                    }
				}
			}
			// 找到al天数对应的grey day天数
			if (singleRule.tableNum == 2 && Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strTeams, "*", rosterPeriodStart, rosterPeriodEnd) && al_num == approvedLeaveDays) {
				grey_num = unassignedDay;
				max_grey_num = maxUnassignedDay;
				vector<string> preferredList;
				std::string textRDO;
				if (!acceptRDOsText.empty())
					textRDO = acceptRDOsText;
				else if (acceptRDOsText.empty() && !preferredRDOsText.empty())
					textRDO = preferredRDOsText;
				if (!textRDO.empty())
					GetRDOList(textRDO, acceptRDOs, totalNumRDONeeded, minNumRDONeeded, maxContinueRDONum);
				if (!exceptRDOsText.empty())
					GetRDOList(exceptRDOsText, exceptRDOs, totalNumRDONeeded, minNumRDONeeded, maxContinueRDONum);
				break;
			}
		}
		cache.RDOAssignment = rdoAssignment;
		//cache.unassignedAssignment = unassignedAssignment;
		split(minSpacingBetweenConsecutiveRDOs, '|', minSpacingBetweenConsecutiveRDOsVec);
		minSpacingBetweenConsecutiveRDOsIntVec.reserve(minSpacingBetweenConsecutiveRDOsVec.size());
		for (auto& spacingStr : minSpacingBetweenConsecutiveRDOsVec) {
			auto spacing = stoi(spacingStr);
			minSpacing = spacing < minSpacing ? spacing : minSpacing;
			minSpacingBetweenConsecutiveRDOsIntVec.emplace_back(spacing);
		}
		if (this->_application != ROSTER_OPTIMIZER) {
			minSpacingBetweenConsecutiveRDOsIntVec.emplace_back(0);
		}
		cache.minSpacingBetweenConsecutiveRDOs = minSpacingBetweenConsecutiveRDOsIntVec;

		cache.leadIn = leadIn;
		cache.multipleLeadOut = multipleLeadOut;
		cache.singleLeadOut = singleLeadOut;
		cache.minLength = minLength;
		cache.acceptRDOs = acceptRDOs;
		cache.exceptRDOs = exceptRDOs;
		cache.unassignedDays = grey_num;
		cache.maxUANum = max_grey_num;
		cache.maxNumRDONeeded = totalNumRDONeeded;
		cache.minNumRDONeeded = minNumRDONeeded;
		cache.useDutyRest = true;
		// 暂无限制，后续需配置字段
		cache.greyDayLeadOut = 4 * 3600;
        std::vector<std::string> unassignedPatternVec;
        split(unassignedPatternStr, '|', unassignedPatternVec);
        for(const auto &unassignedPattern:unassignedPatternVec){
            std::vector<std::string> tempStringVec;
            split(unassignedPattern, ':', tempStringVec);
            if(tempStringVec.size() == 2){
                unassignedPatterns[tempStringVec.front()] = std::stoi(tempStringVec.back());
            }
        }
        cache.unassignedPatterns = std::move(unassignedPatterns);
		const auto& leadOut = cache.multipleLeadOut < cache.singleLeadOut ? cache.multipleLeadOut : cache.singleLeadOut;


		//RDO枚举最小间隔 = min(预占RDO最小间隔, minSpacingBetweenConsecutiveRDOs配置参数)
		//相邻RDO超过RDOpattern中的最大连续数，则间最小隔设为0
		bool findMinSpacing = false;
		std::size_t prevRDOIdx = 0;
		while (prevRDOIdx + 1 < (int)rosterInRange.size() && minSpacing > 0) {
			unsigned char continueRDONum = 1;
			bool findNextRDO = false;
			if (rosterInRange.at(prevRDOIdx)->qualifier != rdoAssignment) {
				prevRDOIdx++;
				continue;
			}
			for (std::size_t nextRDOIdx = prevRDOIdx + 1; nextRDOIdx < rosterInRange.size(); nextRDOIdx++) {
				if (rosterInRange.at(nextRDOIdx)->qualifier != rdoAssignment)
					continue;
				findNextRDO = true;
				//相邻RDO
				if (rosterInRange.at(nextRDOIdx)->actStrLoc <= rosterInRange.at(prevRDOIdx)->actStrLoc + (24 * 3600)) {
					prevRDOIdx = nextRDOIdx;
					continueRDONum++;
					continue;
				}
				auto spacingDayNum = static_cast<int>(rosterInRange.at(nextRDOIdx)->actStrLoc - rosterInRange.at(prevRDOIdx)->actStrLoc) / (24 * 3600) - 1;
				if (spacingDayNum < minSpacing) {
					findMinSpacing = true;
					minSpacing = spacingDayNum;
				}
				prevRDOIdx = nextRDOIdx;
				break;
			}
			if (continueRDONum > maxContinueRDONum){
				minSpacing = 0;
				findMinSpacing = true;
				break;
			}
			if (!findNextRDO)
				break;
		}
		if (findMinSpacing)
			cache.minSpacingBetweenConsecutiveRDOs = { minSpacing };

		// 读取6115数据，设置最大连续工作天数给Helper6001
		int maxConsecutiveTime, addMaxConsecutiveTime, addMaxNumber;
		if (!rules6115.empty()) {
			for (auto& singleRule : rules6115) {
				auto& parameter = singleRule.params;
				string header, headeValue;
				string strBase, strRank, strFleet;
				for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
					header = iter->first;
					headeValue = iter->second;
					if (header == "BASES")
						strBase = headeValue;
					else if (header == "RANKS")
						strRank = headeValue;
					else if (header == "FLEETS")
						strFleet = headeValue;
					else if (header == "MAX CONSECUTIVE DAY")
						maxConsecutiveTime = stoi(headeValue);
					else if (header == "ADD MAX CONSECUTIVE DAY")
						addMaxConsecutiveTime = stoi(headeValue);
					else if (header == "ADD MAX TIMES")
						addMaxNumber = stoi(headeValue);
				}				
				if (Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", rosterPeriodStart, rosterPeriodEnd)) {
					cache.maxConsecutiveTimes = maxConsecutiveTime;
					cache.addMaxConsecutiveTimes = addMaxConsecutiveTime;
					cache.addMaxNumber = addMaxNumber;
					break;
				}	
			}
		}

        
		//统计上一个RP到本RP开始前，连续工作了几天
        //因为除了RDO，都算工作天。所以找到上一个RDO截止的时间，计算到本RP开始，这段时间即可
        int numWorkDayPrevious = 0;
        if (!rosters.empty()) {
            for (int i = (int)rosters.size() - 1; i >= 0; i--) {
                auto& roster = rosters[i];
                // rosters从后往前时间排序，直接计算前一个RP的roster距当前RP的间隔天数
                // 若遇到前一个RP的RDO则break，则以首个RDO（结束时间）与当前RP的间隔天数统计为numWorkDayPrevious
                // 若前一个RP无预占RDO，则以前一个RP的最早的预占roster（开始时间）与当前RP的间隔时间统计为numWorkDayPrevious
                // 若前一个RP无预占，则默认为0
                if (roster->actStrLoc > rosterPeriodStart)
                    continue;
                auto numWorkDayPreviousTemp = static_cast<int>((ceil)((double)(rosterPeriodStart - roster->actStrLoc) / (3600.0 * 24.0))); //取整即为连续工作天数
                auto isAL = find(cache.alAssignments.begin(), cache.alAssignments.end(), rosters[i]->duty) != cache.alAssignments.end();
                if(roster->source != "PA" || numWorkDayPreviousTemp <= cache.addMaxConsecutiveTimes) //预占违规不算违规
                    numWorkDayPrevious = numWorkDayPreviousTemp;
                if (_dbData->isAssignmentInGroup(roster->qualifier, rdoAssignment) || isAL || roster->qualifier == "SDO") {
                    auto numWorkDayPreviousTemp2 = static_cast<int>(rosterPeriodStart - roster->actEndLoc) / (3600 * 24); //取整即为连续工作天数
                    if(roster->source != "PA" || numWorkDayPreviousTemp2 <= cache.addMaxConsecutiveTimes) //预占违规不算违规
                        numWorkDayPrevious = numWorkDayPreviousTemp2;
                    break;
                }
            }
        }
        cache.previousConsecutiveDays = numWorkDayPrevious;

		if (this->GetApplication() != ROSTER_OPTIMIZER) {
			this->_dbData->setRDOParamCacheMap(crew->idCrew, cache);
			return;
		}
		//RO 判断AcceptRDOComb还是ExceptRDOComb
		//if (this->GetApplication() == ROSTER_OPTIMIZER) {
		bool prevStartValid = true;
		std::vector<std::vector<OccupationStatus>> statusVectors = howManyRDOInRange(cache, this->_dbData, pCrew, rosterInRange, rosterPeriodStart, rosterPeriodEnd, prevRosterEndTime, restAssignmentGroupList, true, prevStartValid);
		if (!prevStartValid) {
			// 预占不合规，考虑后续检查可直接返回false

			//tracking前后任务不满足leadin、leadout
			cache.legalPA = false;
			this->_dbData->setRDOParamCacheMap(crew->idCrew, cache);
			continue;
		}
		bool acceptLegal = false;
		bool exceptLegal = false;
		bool usingZeroSpacing = false;
        int unassignedDaysValid = 0;        //实际需要UA数量，取检查过程中遇到的最大值，并且必须比maxUANum小
		// 设置Helper6001参数
		std::unique_ptr<Helper6001> helper6001 = std::make_unique<Helper6001>();
		helper6001->SetDefaultMaxConsecutiveDays(cache.maxConsecutiveTimes);
		helper6001->SetPreviousRosterPeriodMaxConsecutiveDays(cache.addMaxConsecutiveTimes);
		helper6001->SetExceptionMaxConsecutiveDays(cache.addMaxConsecutiveTimes, cache.addMaxNumber);
		helper6001->SetTotalNumRDONeeded(cache.maxNumRDONeeded);
		helper6001->SetPreviousConsecutiveDays(cache.previousConsecutiveDays);
		helper6001->SetLeadoutConsecutiveDays(spanRPConsecutiveDays);
		helper6001->SetInternalMultiThreading(this->_helper6001MT);
        if(cache.coveredWeekends){
            helper6001->AddMustCoverDays({5, 6});
            helper6001->AddMustCoverDays({12, 13});
            helper6001->AddMustCoverDays({19, 20});
            helper6001->AddMustCoverDays({26, 27});
        }
		auto SpacingCheck = [&](const std::vector<std::vector<unsigned char>>& rdoPatterns) {
			for (std::size_t ii = 0; ii < statusVectors.size(); ii++) {
				auto& statusVector = statusVectors[ii];
				std::bitset<Helper6001::RosterPeriodLength> uaSlot;
				int rdo_avaliable = 0;
				for (int i = 0; i < Helper6001::RosterPeriodLength; i++) {
					if (i > 0 && statusVector.at(i - 1) == OccupationStatus::ANNUAL_LEAVE_OCCUPIED) {
						uaSlot.set(i, true);
					}
					if (statusVector.at(i) != OccupationStatus::UNASSIGNED_DAY_AVAILABLE
						&& statusVector.at(i) != OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE) {
						uaSlot.set(i, true);
					}
					if (statusVector.at(i) == OccupationStatus::ROSTER_DAYS_OFF_AVAILABLE || statusVector.at(i) == OccupationStatus::ROSTER_DAYS_OFF_OCCUPIED)
						++rdo_avaliable;
				}
				if (rdo_avaliable < cache.minNumRDONeeded) {
					//告警
				}

				for (const auto& rdoPattern : rdoPatterns) {
					// 获得枚举结果
					auto enumerationRDO = helper6001->GetAllPossiblePattern(this->_dbData->GetHelper6001Cache(), statusVector, rdoPattern);
					if (!enumerationRDO.empty()) {
                        //从最大UA数量开始检查，防止先选到了UA数量小的solution直接赋值给cache.unassignedDays
                        std::stable_sort(enumerationRDO.begin(), enumerationRDO.end(),
                                            [&](const std::bitset<Helper6001::RosterPeriodLength> &solutionLhs,
                                                const std::bitset<Helper6001::RosterPeriodLength> &solutionRhs) {
                                                std::bitset<Helper6001::RosterPeriodLength> uaSlotLhs = uaSlot;
                                                std::bitset<Helper6001::RosterPeriodLength> uaSlotRhs = uaSlot;
                                                SetGreyDayAvailableTemp(solutionLhs, rosters, uaSlotLhs, cache,
                                                                        rosterPeriodStart);
                                                SetGreyDayLeadOutAvailable(solutionLhs, rosters, uaSlotLhs, cache, rosterPeriodStart);
                                                auto occupiedBitsetLhs = solutionLhs | uaSlotLhs;
                                                int occupiedLhs = (int) occupiedBitsetLhs.count();
                                                SetGreyDayAvailableTemp(solutionRhs, rosters, uaSlotRhs, cache,
                                                                        rosterPeriodStart);
                                                SetGreyDayLeadOutAvailable(solutionRhs, rosters, uaSlotRhs, cache, rosterPeriodStart);
                                                auto occupiedBitsetRhs = solutionRhs | uaSlotRhs;
                                                int occupiedRhs = (int) occupiedBitsetRhs.count();
                                                return occupiedLhs < occupiedRhs;
                                            });
						// 遍历所有枚举结果
						for (const auto& solution : enumerationRDO) {
							if (!CheckRDOLengthAndLeadOutLegality(solution, rosters, cache, rosterPeriodStart, rosterPeriodEnd, pCrew, &rules[0], false))
								continue;
							if (!CheckALBlockLegality(solution, rosters, cache, rosterPeriodStart))
								continue;
							if (!CheckAnnualLeaveRDO(solution, rosters, rosterPeriodStart, cache))
								continue;
                            if (rule6011 && !rule6011->CheckRuleWithRDOPattern(rosters, solution, rosterPeriodStart))
                                continue;
							/*if (!CheckRDOLengthAndLeadOutLegality(solution, rosters, cache, rosterPeriodStart, rosterPeriodEnd)
								|| !CheckALBlockLegality(solution, rosters, cache, rosterPeriodStart)
								|| !CheckAnnualLeaveRDO(solution, rosters, rosterPeriodStart))
								continue;*/
                            //SetGreyDayLeadOutAvailable(solution, rosters, uaSlot, cache, rosterPeriodStart);
                            std::bitset<Helper6001::RosterPeriodLength> uaSlotTemp = uaSlot;
                            if(crew->division == "P"){
                                SetGreyDayAvailableTemp(solution, rosters, uaSlotTemp, cache, rosterPeriodStart);
                                SetGreyDayLeadOutAvailable(solution, rosters, uaSlotTemp, cache, rosterPeriodStart);
                            }
							// 加上预占的ua/grey
							int ua_used_count = used_grey_num;
							bool check = false;
							const auto& occupiedBitset = solution | uaSlotTemp;
							int occupied = (int)occupiedBitset.count();
                            int unassignedDaysTemp = used_grey_num + (int)Helper6001::RosterPeriodLength - occupied;
                            //unassignedDaysTemp = unassignedDaysTemp < cache.maxUANum ? unassignedDaysTemp : cache.maxUANum;
                            unassignedDaysTemp = cache.unassignedDays < unassignedDaysTemp ? cache.unassignedDays : unassignedDaysTemp;
							if (this->GetApplication() != ROSTER_OPTIMIZER) {
								unassignedDaysTemp = cache.maxUANum;
							}
							// 判断剩余天数是否满足UA天数
							if (static_cast<int>(Helper6001::RosterPeriodLength) - occupied >= unassignedDaysTemp - ua_used_count) {
								std::bitset<Helper6001::RosterPeriodLength> uaOccupied;
								// 寻找RDO前后是否可以排UA
								for (std::size_t i = 0; i < Helper6001::RosterPeriodLength; ++i) {
									if (ua_used_count >= unassignedDaysTemp) {
										check = true;
										break;
									}
									if (!occupiedBitset.test(i)) {
										if (i != 0 && i != Helper6001::RosterPeriodLength - 1 && (solution.test(i - 1) || solution.test(i + 1))) {
											uaOccupied.set(i, true);
											++ua_used_count;
										}
									}
								}
								// 目前没有强制要求UA在RDO前后，暂时UA天数满足就返回true  2023.11.15 jiaxin.jin
								check = true;
								if (check) {
                                    if(unassignedDaysValid < unassignedDaysTemp && unassignedDaysTemp <= cache.maxUANum)
                                        unassignedDaysValid = unassignedDaysTemp;
									return true;
								}
							}
						}
					}
				}
			}
			return false;
		};

		// accept RDO 检查
		for (auto& spacing : cache.minSpacingBetweenConsecutiveRDOs) {
			// cache.minSpacingBetweenConsecutiveRDOs中可能已经存在间隔0参数
			if (spacing == 0)
				usingZeroSpacing = true;
			helper6001->SetMinSpacingBetweenConsecutiveRDOs(spacing);
			acceptLegal = SpacingCheck(acceptRDOs);
			if (acceptLegal)
				break;
		}
		// accept RDO 不合规 && 未使用间隔0，则在accept RDO 上使用间隔0
		if (!acceptLegal && !usingZeroSpacing) {
			helper6001->SetMinSpacingBetweenConsecutiveRDOs(0);
			acceptLegal = SpacingCheck(acceptRDOs);
			// 间隔0合规，则将cache.minSpacingBetweenConsecutiveRDOs设为0
			if (acceptLegal) {
				cache.minSpacingBetweenConsecutiveRDOs = { 0 };
			}
		}
		// accept RDO 不合规，检查except RDO
		if (!acceptLegal) {
			usingZeroSpacing = false;
			cache.isExceptRDO = true;
			for (auto& spacing : cache.minSpacingBetweenConsecutiveRDOs) {
				if (spacing == 0)
					usingZeroSpacing = true;
				helper6001->SetMinSpacingBetweenConsecutiveRDOs(spacing);
				exceptLegal = SpacingCheck(exceptRDOs);
				if (exceptLegal)
					break;
			}
			if (!exceptLegal && !usingZeroSpacing) {
				helper6001->SetMinSpacingBetweenConsecutiveRDOs(0);
				exceptLegal = SpacingCheck(exceptRDOs);
				// 间隔0合规，则将cache.minSpacingBetweenConsecutiveRDOs设为0
				if (exceptLegal) {
					cache.minSpacingBetweenConsecutiveRDOs = { 0 };
				}
			}
		}
		if (!acceptLegal && !exceptLegal) {
			// 预占不合规，考虑后续检查可直接返回false
			cache.legalPA = false;
		}
        cache.unassignedDays = unassignedDaysValid;
		//}
		this->_dbData->setRDOParamCacheMap(crew->idCrew, cache);
	}
}

// 贪婪
// 需要对map进行删除操作，不能const &
//vector<std::unique_ptr<RDO_Ranges>> LegalityChecker::checkRDOValid(map<int, vector<RDO_Ranges*>> map, const vector<int>& preferred) {
//
//	vector<std::unique_ptr<RDO_Ranges>> result;
//	if (map.empty()) return decltype(result)();
//	for (int day : preferred) {
//		if (map.find(day) != map.end() &&  map.at(day).size() != 0) {
//			//按顺序删除第一个
//			auto& iter = map.at(day).begin();
//			result.push_back(std::unique_ptr<RDO_Ranges>(map[day][0]));
//			map.at(day).erase(iter);
//		}
//		else {
//			// 获得最大的天数
//			const auto last = map.rbegin()->first;
//			// 最大天数小于所需天数，直接返回false
//			if (last < day) return decltype(result)();
//			auto & ranges = map.at(last);
//
//			if (ranges.size() != 0) {
//				// 截取连续天数内的所需天数
//				auto range = std::make_unique<RDO_Ranges>();
//				range->startTime = ranges[0]->startTime;
//				range->endTime = range->startTime + day * 3600 * 24;
//				result.push_back(std::move(range));
//				auto & newRange = ranges[0];
//				// 把截取部分去除，并且根据实际剩余天数重新放入map
//				newRange->startTime = newRange->startTime + day * 3600 * 24;
//				map[last - day].push_back(newRange);
//				if (ranges.size() == 1) {
//					// 如果只有一条直接删除key-value
//					map.erase(last);
//				}
//				else {
//					ranges.erase(ranges.begin());
//				}
//			}
//		}
//	}
//	if (result.size() != preferred.size()) {
//		result.clear();
//	}
//
//	return std::move(result);
//
//}


