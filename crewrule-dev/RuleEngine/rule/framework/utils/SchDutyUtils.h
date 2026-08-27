#ifndef _SCHDUTYUTILS_H_
#define _SCHDUTYUTILS_H_

#include "CrewDB.h"
#include "RuleParams.h"

/*
* 通过Duty采用计划时间进行相关计算，仅用于EVA计划时间法规
*/
class SchDutyUtils {

public:

	//通过计划时间，获得Duty的计划开始时间
	inline static time_t GetDutySchStartTimeUtc(const Duty* duty, const bool supportManualModifyNode = false) {
		if (supportManualModifyNode) {
			auto pickup = duty->getFirstPickup();
			auto brief = duty->getFirstBreif();
			if ((pickup != nullptr && pickup->getIsManualModify())
				|| (brief != nullptr && brief->getIsManualModify())) {
				return duty->getStartTimeUtcAct();
			}
		}
		if (duty->getFirstSegment() == nullptr) {
			//异常数据处理
			return duty->getStartTimeUtcAct();
		}
		return duty->getFirstSegment()->getStartTimeUtcSch() - (time_t)duty->getMinBrief() * 60;
	}

	//通过计划时间，获得Duty的计划结束时间
	inline static time_t GetDutySchEndTimeUtc(const Duty* duty, const bool supportManualModifyNode = false) {
		if (supportManualModifyNode) {
			auto debrief = duty->getLastDebrief();
			auto dropoff = duty->getLastDropoff();
			if ((dropoff != nullptr && dropoff->getIsManualModify())
				|| (debrief != nullptr && debrief->getIsManualModify())) {
				return duty->getEndTimeUtcAct();
			}
		}
		if (duty->getLastSegment() == nullptr) {
			//异常数据处理
			return duty->getEndTimeUtcAct();
		}
		return duty->getLastSegment()->getEndTimeUtcSch() + (time_t)duty->getMinDebrief() * 60;
	}

	//通过计划时间，获得Duty的计划开始时间
	inline static time_t GetDutySchStartTimeLoc(const Duty* duty, const bool supportManualModifyNode = false) {
		if (supportManualModifyNode) {
			auto pickup = duty->getFirstPickup();
			auto brief = duty->getFirstBreif();
			if ((pickup != nullptr && pickup->getIsManualModify())
				|| (brief != nullptr && brief->getIsManualModify())) {
				return duty->getStartTimeLocAct();
			}
		}
		if (duty->getFirstSegment() == nullptr) {
			//异常数据处理
			return duty->getStartTimeLocAct();
		}
		return duty->getFirstSegment()->getStartTimeLocSch() - (time_t)duty->getMinBrief() * 60;
	}

	//通过计划时间，获得Duty的计划结束时间
	inline static time_t GetDutySchEndTimeLoc(const Duty* duty, const bool supportManualModifyNode = false) {
		if (supportManualModifyNode) {
			auto debrief = duty->getLastDebrief();
			auto dropoff = duty->getLastDropoff();
			if ((dropoff != nullptr && dropoff->getIsManualModify())
				|| (debrief != nullptr && debrief->getIsManualModify())) {
				return duty->getEndTimeLocAct();
			}
		}
		if (duty->getLastSegment() == nullptr) {
			//异常数据处理
			return duty->getEndTimeLocAct();
		}
		return duty->getLastSegment()->getEndTimeLocSch() + (time_t)duty->getMinDebrief() * 60;
	}

	//通过计划时间，获得Pairing的计划开始时间
	inline static time_t GetPairingSchStartTimeUtc(const Pairing* pairing, const bool supportManualModifyNode = false) {
		Duty* firstDuty = pairing->getFirstDuty();
		if (supportManualModifyNode) {
			auto pickup = firstDuty->getFirstPickup();
			auto brief = firstDuty->getFirstBreif();
			if ((pickup != nullptr && pickup->getIsManualModify())
				|| (brief != nullptr && brief->getIsManualModify())) {
				return pairing->getStartTimeUtcAct();
			}
		}
		if (firstDuty->getFirstSegment() == nullptr) {
			//异常数据处理
			return pairing->getStartTimeUtcAct();
		}
		return firstDuty->getFirstSegment()->getStartTimeUtcSch() - (time_t)firstDuty->getMinBrief() * 60 - (time_t)firstDuty->getMinPickup() * 60;
	}

	//通过计划时间，获得Pairing的计划结束时间
	inline static time_t GetPairingSchEndTimeUtc(const Pairing* pairing, const bool supportManualModifyNode = false) {
		Duty* lastDuty = pairing->getLastDuty();

		if (supportManualModifyNode) {
			auto debrief = lastDuty->getLastDebrief();
			auto dropoff = lastDuty->getLastDropoff();
			if ((dropoff != nullptr && dropoff->getIsManualModify())
				|| (debrief != nullptr && debrief->getIsManualModify())) {
				return pairing->getEndTimeUtcAct();
			}
		}
		if (lastDuty->getLastSegment() == nullptr) {
			//异常数据处理
			return pairing->getEndTimeUtcAct();
		}
		return lastDuty->getLastSegment()->getEndTimeUtcSch() + (time_t)lastDuty->getMinDebrief() * 60 + (time_t)lastDuty->getMinDropoff() * 60;
	}

	//通过计划时间，获得Pairing的计划开始时间
	inline static time_t GetPairingSchStartTimeLoc(const Pairing* pairing, const bool supportManualModifyNode = false) {
		Duty* firstDuty = pairing->getFirstDuty();

		if (supportManualModifyNode) {
			auto pickup = firstDuty->getFirstPickup();
			auto brief = firstDuty->getFirstBreif();
			if ((pickup != nullptr && pickup->getIsManualModify())
				|| (brief != nullptr && brief->getIsManualModify())) {
				return pairing->getStartTimeLocAct();
			}
		}
		if (firstDuty->getFirstSegment() == nullptr) {
			//异常数据处理
			return pairing->getStartTimeLocAct();
		}
		return firstDuty->getFirstSegment()->getStartTimeLocSch() - (time_t)firstDuty->getMinBrief() * 60 - (time_t)firstDuty->getMinPickup() * 60;
	}

	//通过计划时间，获得Pairing的计划结束时间
	inline static time_t GetPairingSchEndTimeLoc(const Pairing* pairing, const bool supportManualModifyNode = false) {
		Duty* lastDuty = pairing->getLastDuty();

		if (supportManualModifyNode) {
			auto debrief = lastDuty->getLastDebrief();
			auto dropoff = lastDuty->getLastDropoff();
			if ((dropoff != nullptr && dropoff->getIsManualModify())
				|| (debrief != nullptr && debrief->getIsManualModify())) {
				return pairing->getEndTimeLocAct();
			}
		}
		if (lastDuty->getLastSegment() == nullptr) {
			//异常数据处理
			return pairing->getEndTimeLocAct();
		}
		return lastDuty->getLastSegment()->getEndTimeLocSch() + (time_t)lastDuty->getMinDebrief() * 60 + (time_t)lastDuty->getMinDropoff() * 60;
	}

	//通过计划时间，获得Pairing的计划结束时间（包括休息时长）
	inline static time_t GetPairingEndTimeIncludingRestUtcSch(const Pairing* pairing, const bool supportManualModifyNode = false) {
		Duty* lastDuty = pairing->getLastDuty();

		if (supportManualModifyNode) {
			auto debrief = lastDuty->getLastDebrief();
			auto dropoff = lastDuty->getLastDropoff();
			if ((dropoff != nullptr && dropoff->getIsManualModify())
				|| (debrief != nullptr && debrief->getIsManualModify())) {
				return pairing->getEndTimeUtcAct() + (time_t)lastDuty->getScheduleRest() * 60;
			}
		}
		if (lastDuty->getLastSegment() == nullptr) {
			//异常数据处理
			return pairing->getEndTimeUtcAct();
		}
		return lastDuty->getLastSegment()->getEndTimeUtcSch() + (time_t)lastDuty->getMinDebrief() * 60 + (time_t)lastDuty->getMinDropoff() * 60 + (time_t)lastDuty->getScheduleRest() * 60;
	}

	//Segment是否存在7264法规配置的计划时间需要检查的机型
	inline static time_t existFleets(const Segment* segment) {
		if (segment == nullptr) {
			return false;
		}
		auto& schTimeCheckFleets = RuleParams::GetInstancePtr()->schTimeCheckFleets;
		if (schTimeCheckFleets.empty() || std::find(schTimeCheckFleets.begin(), schTimeCheckFleets.end(), segment->getFleetCD()) != schTimeCheckFleets.end()) {
			return true;
		}
		return false;
	}

	//duty是否存在7264法规配置的计划时间需要检查的机型
	inline static time_t existFleetsInDuty(const Duty* duty) {
		if (duty == nullptr) {
			return false;
		}
		for (auto& segment : duty->getSegmentsRead()) {
			if (existFleets(segment)) {
				return true;
			}
		}
		return false;
	}

	//duty是否存在7264法规配置的计划时间需要检查的机型
	inline static time_t existFleetsInPairing(const Pairing* pairing) {
		if (pairing == nullptr) {
			return false;
		}
		for (auto& duty : pairing->getDutyVec()) {
			if (existFleetsInDuty(duty)) {
				return true;
			}
		}
		return false;
	}

	//获得Duty间休息时长，去除Pickup和Dropoff时长，单位：分钟
	static int GetScheduleRestMinutes(const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData);
	static int GetScheduleRestMinutesIncludePickupAndDropoff(const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData);

	static int GetScheduleRestMinutes(time_t& schRestStartTimeUtc, const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData);
	static int GetScheduleRestMinutesIncludePickupAndDropoff(time_t& schRestStartTimeUtc, const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData);

	//获得Duty与地面任务（Roster）之间休息时长，去除Pickup和Dropoff时长，单位：分钟
	static int GetScheduleRestMinutes(const Duty* currDuty, const ROSTER* nextRoster, const SharedPtr<CrewDataContext>& dbData);

	static int GetScheduleRestMinutes(time_t& schRestStartTimeUtc, const Duty* currDuty, const ROSTER* nextRoster, const SharedPtr<CrewDataContext>& dbData);

};

#endif //_SCHDUTYUTILS_H_