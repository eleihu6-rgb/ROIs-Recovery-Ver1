#include <iostream>
#include <atomic>
#include "Pairing.h"
#include "CrewDBUtil.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"

static atomic<long long> tmpIdGenerator(-1);

//通过Segment检查对应的航班是否实际起飞
inline static bool IsActualTakeOff(const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
	//auto iterFlt = dbData->flightIdMap.find(segment->getDBId());
	//if (iterFlt == dbData->flightIdMap.end()) {
	//	return false;
	//}
	//auto& flight = iterFlt->second;
	auto& flight = segment;

	if (flight->getActTaxiOutUtc() > 0) {
		return true;
	}

	if (flight->getStartTimeUtcAct() > 0 && flight->getEstDepDtUtc() > 0 && flight->getStartTimeUtcAct() != flight->getEstDepDtUtc()) {
		return true;
	}

	return false;
}

//在航班提前起飞时，是否可以调整Duty的Brief时间。返回 true：可以调整Brief时间，false：不可以调整Brief时间
inline static bool IsChangeBriefOnTakeOffEarly(const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
	//auto iterFlt = dbData->flightIdMap.find(segment->getDBId());
	//if (iterFlt == dbData->flightIdMap.end()) {
	//	return false;
	//}
	//auto& flight = iterFlt->second;
	auto& flight = segment;

	if (flight->getStartTimeUtcAct() >= flight->getStartTimeUtcSch()) {
		//航班未提前起飞,则可以调整Brief
		return true;
	}

	int briefHour = 3;//“航班变动时间点” 与“航班计划时间”之间间隔时长，单位小时
	if (dbData->systemParamMap.find("EARLY_ETD_BRIEF_RECAL_HR") != dbData->systemParamMap.end()) {
		briefHour = stoi(dbData->systemParamMap["EARLY_ETD_BRIEF_RECAL_HR"]);
	}

	//在航班STD前X小时(briefHour)航班预计提前起飞，则可以调整Brief时间
	if (flight->getEtdChgTm() != 0 && ((flight->getStartTimeUtcSch() - flight->getEtdChgTm()) >= (time_t)briefHour * 3600)) {
		return true;
	}

	return false;
}

//
//1. 遍历pg.duty[], 为每一duty创建 DutyNode brief/debrief/pick/dropoff
//2. 0表示成功, 其他为错误码
//3. 
int createPairingNodeOfDuty(Pairing* pg, CrewDataContext *dbData) {
	if (!pg) {
		return 0;
	}
	
	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty* d = pg->getDuty(i);
		if (d->pairingDutyNodes.size() > 0) {
			continue;//only reset duty with no nodes
		}

		createPairingNodeOfDuty(d, dbData, pg); //2021.02.01 modified by zzm ,po duty calcualte pairingDutyNode
	}
	return 0;
}

int createPairingNodeOfDuty(Duty * d, CrewDataContext *dbData, Pairing* pg) {
    string type = "ACT";
    shared_ptr<PairingDutyNode> brief = createBriefNodeOfDuty(d, dbData, pg, type);
	shared_ptr<PairingDutyNode> pickup = createPickupNodeOfDuty(d, brief, dbData, pg);
	shared_ptr<PairingDutyNode> debrief = createDebriefNodeOfDuty(d, dbData, pg, type);
	shared_ptr<PairingDutyNode> dropoff = createDropoffNodeOfDuty(d, debrief, dbData, pg);
	d->pairingDutyNodes.push_back(pickup);
	d->pairingDutyNodes.push_back(brief);
	d->pairingDutyNodes.push_back(debrief);
	d->pairingDutyNodes.push_back(dropoff);
    return 0;
}

void refreshPairingNodeOfDutyThreadLocalTime(Duty * duty, CrewDataContext *dbData) {
	const std::string type = "ACT";
	refreshBriefNodeOfDutyThreadLocalTime(duty, dbData, type);
	refreshPickupNodeOfDutyThreadLocalTime(duty, duty->getFirstBreif(), dbData);
	refreshDebriefNodeOfDutyThreadLocalTime(duty, type);
	refreshDropoffNodeOfDutyThreadLocalTime(duty, duty->getLastDebrief());
}

//int createPairingNodeOfDuty(Duty * d, CrewDataContext *dbData, Pairing* pg) {
//	//2021.02.01 modified by zzm ,po duty calcualte pairingDutyNode
//	int briefHour = 3;
//	if (dbData->systemParamMap.find("ETD_BRIEF_RECAL_HR") != dbData->systemParamMap.end()) {
//		briefHour = stoi(dbData->systemParamMap["ETD_BRIEF_RECAL_HR"]);
//	}
//	Segment* first = d->getFirstSegment();
//	Segment* last = d->getLastSegment();
//
//	int pickupMin = d->getActualPickupMin();
//	int briefMin = d->getActualBriefMin();
//	int debriefMin = d->getActualDebriefMin();
//	int dropoffMin = d->getActualDropoffMin();
//
//	shared_ptr<PairingDutyNode> pickup(new PairingDutyNode);
//	shared_ptr<PairingDutyNode> brief(new PairingDutyNode);
//	shared_ptr<PairingDutyNode> debrief(new PairingDutyNode);
//	shared_ptr<PairingDutyNode> dropoff(new PairingDutyNode);
//
//	//20200417 ain, mantis#8073, savePO流程 dutyNode逻辑补齐 pairingId/dutyId/from|toSegmentId
//	pickup->setId(tmpIdGenerator.fetch_sub(1));
//	brief->setId(tmpIdGenerator.fetch_sub(1));
//	debrief->setId(tmpIdGenerator.fetch_sub(1));
//	dropoff->setId(tmpIdGenerator.fetch_sub(1));
//
//	// setup scenario id for output
//	pickup->setScenarioId(dbData->scenarioId);
//	brief->setScenarioId(dbData->scenarioId);
//	debrief->setScenarioId(dbData->scenarioId);
//	dropoff->setScenarioId(dbData->scenarioId);
//
//	if (pg != nullptr) {
//		pickup->setPairingId(pg->getDbId());
//		brief->setPairingId(pg->getDbId());
//		debrief->setPairingId(pg->getDbId());
//		dropoff->setPairingId(pg->getDbId());
//	}
//	else{
//		pickup->setPairingId(-d->getId()); //PO阶段组duty未生成pairing，取dutyId的负数
//		brief->setPairingId(-d->getId());
//		debrief->setPairingId(-d->getId());
//		dropoff->setPairingId(-d->getId());
//	}
//
//	pickup->setDutyId(d->getDutyId());
//	brief->setDutyId(d->getDutyId());
//	debrief->setDutyId(d->getDutyId());
//	dropoff->setDutyId(d->getDutyId());
//	pickup->setFromSegmentId(0);
//	brief->setFromSegmentId(0);
//	debrief->setFromSegmentId(0);
//	dropoff->setFromSegmentId(0);
//	pickup->setToSegmentId(0);
//	brief->setToSegmentId(0);
//	debrief->setToSegmentId(0);
//	dropoff->setToSegmentId(0);
//
//	brief->setEndLoc(first->getStartTimeLocAct());
//	brief->setStartLoc(brief->getEndLoc() - briefMin * 60);
//	brief->setEndUtc(first->getStartTimeUtcAct());
//	brief->setStartUtc(brief->getEndUtc() - briefMin * 60);
//	if ((brief->getIsManualModify() == 0 || d->getBriefNeedRuleReCalc()) && first->getEtdChgTm() > 0 &&
//		first->getStartTimeUtcSch() - first->getEtdChgTm() >= briefHour * 3600) {
//		brief->setEndLoc(first->getStartTimeLocAct());
//		brief->setEndUtc(first->getStartTimeUtcAct());
//		brief->setStartLoc(first->getStartTimeLocAct() - d->getMinBrief() * 60);
//		brief->setStartUtc(first->getStartTimeUtcAct() - d->getMinBrief() * 60);
//	}
//	pickup->setEndLoc(brief->getStartLoc());
//	pickup->setStartLoc(pickup->getEndLoc() - pickupMin * 60);
//	pickup->setEndUtc(brief->getStartUtc());
//	pickup->setStartUtc(pickup->getEndUtc() - pickupMin * 60);
//	if ((pickup->getIsManualModify() == 0 || d->getBriefNeedRuleReCalc()) && first->getEtdChgTm() > 0 &&
//		first->getStartTimeUtcSch() - first->getEtdChgTm() >= briefHour * 3600) {
//		pickup->setEndLoc(brief->getStartLoc());
//		pickup->setEndUtc(brief->getStartUtc());
//		pickup->setStartLoc(pickup->getEndLoc() - d->getMinPickup() * 60);
//		pickup->setStartUtc(pickup->getEndUtc() - d->getMinPickup() * 60);
//	}
//	debrief->setStartLoc(last->getEndTimeLocAct());
//	debrief->setEndLoc(debrief->getStartLoc() + debriefMin * 60);
//	debrief->setStartUtc(last->getEndTimeUtcAct());
//	debrief->setEndUtc(debrief->getStartUtc() + debriefMin * 60);
//	dropoff->setStartLoc(debrief->getEndLoc());
//	dropoff->setEndLoc(dropoff->getStartLoc() + dropoffMin * 60);
//	dropoff->setStartUtc(debrief->getEndUtc());
//	dropoff->setEndUtc(dropoff->getStartUtc() + dropoffMin * 60);
//
//	pickup->setAirport(first ? first->getDepSta() : d->getDepartureStation());
//	pickup->setGroupId(1);
//	pickup->setSequence(1);
//	pickup->setType("DUTY");
//	pickup->setNode("PICKUP");
//
//	brief->setAirport(first ? first->getDepSta() : d->getDepartureStation());
//	brief->setGroupId(1);
//	brief->setSequence(2);
//	brief->setType("DUTY");
//	brief->setNode("BRIEF");
//
//	debrief->setAirport(last ? last->getArrSta() : d->getArrivalStation());
//	debrief->setGroupId(1);
//	debrief->setSequence(3);
//	debrief->setType("DUTY");
//	debrief->setNode("DEBRIEF");
//
//	dropoff->setAirport(last ? last->getArrSta() : d->getArrivalStation());
//	dropoff->setGroupId(1);
//	dropoff->setSequence(4);
//	dropoff->setType("DUTY");
//	dropoff->setNode("DROPOFF");
//
//	d->pairingDutyNodes.push_back(pickup);
//	d->pairingDutyNodes.push_back(brief);
//	d->pairingDutyNodes.push_back(debrief);
//	d->pairingDutyNodes.push_back(dropoff);
//
//	//20200423 ain, mantis#8144, 按arp/loc赋值 utc
////	setPairingNodeUtc(pickup, dbData);
////	setPairingNodeUtc(brief, dbData);
////	setPairingNodeUtc(debrief, dbData);
////	setPairingNodeUtc(dropoff, dbData);
//
//	return 0;
//}

/**
 * 创建Duty的Brief节点
 * @param duty
 * @param dbData
 * @param pg
 * @param schOrActType  计划或实际时间类型 取值：SCH、ACT
 * @return
 */
shared_ptr<PairingDutyNode> createBriefNodeOfDuty(Duty * duty, CrewDataContext *dbData, Pairing* pg, string schOrActType) {
    Segment* first = duty->getFirstSegment();

    shared_ptr<PairingDutyNode> brief(new PairingDutyNode);

    //20200417 ain, mantis#8073, savePO流程 dutyNode逻辑补齐 pairingId/dutyId/from|toSegmentId
    brief->setId(tmpIdGenerator.fetch_sub(1));

    // setup scenario id for output
    brief->setScenarioId(dbData->scenarioId);

    if (pg != nullptr) {
        brief->setPairingId(pg->getDbId());
    }
    else{
        brief->setPairingId(-duty->getId());
    }

    brief->setDutyId(duty->getDutyId());
    brief->setFromSegmentId(0);
    brief->setToSegmentId(0);
	refreshBriefNodeOfDutyThreadLocalTime(duty, dbData, schOrActType, brief);
    // brief->setEndLoc(first->getStartTimeLoc(schOrActType));
    // brief->setStartLoc(brief->getEndLoc() - briefMin * 60);
    // brief->setEndUtc(first->getStartTimeUtc(schOrActType));
    // brief->setStartUtc(brief->getEndUtc() - briefMin * 60);
    // if ((brief->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) && first->getEtdChgTm() > 0 &&
    //     first->getStartTimeUtcSch() - first->getEtdChgTm() >= briefHour * 3600) {
    //     brief->setEndLoc(first->getStartTimeLoc(schOrActType));
    //     brief->setEndUtc(first->getStartTimeUtc(schOrActType));
    //     brief->setStartLoc(first->getStartTimeLoc(schOrActType) - duty->getMinBrief() * 60);
    //     brief->setStartUtc(first->getStartTimeUtc(schOrActType) - duty->getMinBrief() * 60);
    // }
    brief->setAirport(first ? first->getDepSta() : duty->getDepartureStation());
    brief->setGroupId(1);
    brief->setSequence(2);
    brief->setType("DUTY");
    brief->setNode("BRIEF");

    return brief;
}

void refreshBriefNodeOfDutyThreadLocalTime(Duty * duty, CrewDataContext *dbData, const std::string& schOrActType, std::shared_ptr<PairingDutyNode> briefNode) {

	auto brief = briefNode ? briefNode : duty->getFirstBreif();
	if (!brief) return;

	int briefHour = 3;
	if (dbData->systemParamMap.find("ETD_BRIEF_RECAL_HR") != dbData->systemParamMap.end()) {
		briefHour = stoi(dbData->systemParamMap["ETD_BRIEF_RECAL_HR"]);
	}

	Segment* first = duty->getFirstSegment();
	int briefMin = duty->getActualBriefMin();

	brief->setEndLoc(first->getStartTimeLoc(schOrActType));
	brief->setStartLoc(brief->getEndLoc() - briefMin * 60);
	brief->setEndUtc(first->getStartTimeUtc(schOrActType));
	brief->setStartUtc(brief->getEndUtc() - briefMin * 60);
	if ((brief->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) && first->getEtdChgTm() > 0 &&
		first->getStartTimeUtcSch() - first->getEtdChgTm() >= briefHour * 3600) {
		brief->setEndLoc(first->getStartTimeLoc(schOrActType));
		brief->setEndUtc(first->getStartTimeUtc(schOrActType));
		brief->setStartLoc(first->getStartTimeLoc(schOrActType) - duty->getMinBrief() * 60);
		brief->setStartUtc(first->getStartTimeUtc(schOrActType) - duty->getMinBrief() * 60);
		}
}

/**
 * 创建Duty的Pickup节点
 * @param duty
 * @param brief  Brief节点
 * @param dbData
 * @param pg
 * @return
 */
shared_ptr<PairingDutyNode> createPickupNodeOfDuty(Duty * duty, shared_ptr<PairingDutyNode>& brief, CrewDataContext *dbData, Pairing* pg) {
    //2021.02.01 modified by zzm ,po duty calcualte pairingDutyNode
    Segment* first = duty->getFirstSegment();

    shared_ptr<PairingDutyNode> pickup(new PairingDutyNode);

    //20200417 ain, mantis#8073, savePO流程 dutyNode逻辑补齐 pairingId/dutyId/from|toSegmentId
    pickup->setId(tmpIdGenerator.fetch_sub(1));

    // setup scenario id for output
    pickup->setScenarioId(dbData->scenarioId);

    if (pg != nullptr) {
        pickup->setPairingId(pg->getDbId());
    }
    else{
        pickup->setPairingId(-duty->getId()); //PO阶段组duty未生成pairing，取dutyId的负数
    }

    pickup->setDutyId(duty->getDutyId());
    pickup->setFromSegmentId(0);
    pickup->setToSegmentId(0);
	refreshPickupNodeOfDutyThreadLocalTime(duty, brief, dbData, pickup);
    // pickup->setEndLoc(brief->getStartLoc());
    // pickup->setStartLoc(pickup->getEndLoc() - pickupMin * 60);
    // pickup->setEndUtc(brief->getStartUtc());
    // pickup->setStartUtc(pickup->getEndUtc() - pickupMin * 60);
    // if ((pickup->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) && first->getEtdChgTm() > 0 &&
    //     first->getStartTimeUtcSch() - first->getEtdChgTm() >= briefHour * 3600) {
    //     pickup->setEndLoc(brief->getStartLoc());
    //     pickup->setEndUtc(brief->getStartUtc());
    //     pickup->setStartLoc(pickup->getEndLoc() - duty->getMinPickup() * 60);
    //     pickup->setStartUtc(pickup->getEndUtc() - duty->getMinPickup() * 60);
    // }

    pickup->setAirport(first ? first->getDepSta() : duty->getDepartureStation());
    pickup->setGroupId(1);
    pickup->setSequence(1);
    pickup->setType("DUTY");
    pickup->setNode("PICKUP");
    return pickup;
}

void refreshPickupNodeOfDutyThreadLocalTime(Duty * duty, shared_ptr<PairingDutyNode> brief, CrewDataContext *dbData, std::shared_ptr<PairingDutyNode> pickupNode) {

	auto pickup = pickupNode ? pickupNode : duty->getFirstPickup();
	if (!pickup) return;

	int briefHour = 3;
	if (dbData->systemParamMap.find("ETD_BRIEF_RECAL_HR") != dbData->systemParamMap.end()) {
		briefHour = stoi(dbData->systemParamMap["ETD_BRIEF_RECAL_HR"]);
	}
	Segment* first = duty->getFirstSegment();
	int pickupMin = duty->getActualPickupMin();

	pickup->setEndLoc(brief->getStartLoc());
	pickup->setStartLoc(pickup->getEndLoc() - pickupMin * 60);
	pickup->setEndUtc(brief->getStartUtc());
	pickup->setStartUtc(pickup->getEndUtc() - pickupMin * 60);
	if ((pickup->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) && first->getEtdChgTm() > 0 &&
		first->getStartTimeUtcSch() - first->getEtdChgTm() >= briefHour * 3600) {
		pickup->setEndLoc(brief->getStartLoc());
		pickup->setEndUtc(brief->getStartUtc());
		pickup->setStartLoc(pickup->getEndLoc() - duty->getMinPickup() * 60);
		pickup->setStartUtc(pickup->getEndUtc() - duty->getMinPickup() * 60);
		}
}

/**
 * 创建Duty的Debrief节点
 * @param duty
 * @param dbData
 * @param pg
 * @param schOrActType
 * @return
 */
shared_ptr<PairingDutyNode> createDebriefNodeOfDuty(Duty * duty, CrewDataContext *dbData, Pairing* pg, string schOrActType) {
    //2021.02.01 modified by zzm ,po duty calcualte pairingDutyNode
    Segment* last = duty->getLastSegment();

    shared_ptr<PairingDutyNode> debrief(new PairingDutyNode);


    //20200417 ain, mantis#8073, savePO流程 dutyNode逻辑补齐 pairingId/dutyId/from|toSegmentId
    debrief->setId(tmpIdGenerator.fetch_sub(1));

    // setup scenario id for output
    debrief->setScenarioId(dbData->scenarioId);

    if (pg != nullptr) {
        debrief->setPairingId(pg->getDbId());
    }
    else{
        debrief->setPairingId(-duty->getId());
    }

    debrief->setDutyId(duty->getDutyId());
    debrief->setFromSegmentId(0);
    debrief->setToSegmentId(0);
	refreshDebriefNodeOfDutyThreadLocalTime(duty, schOrActType, debrief);
    // debrief->setStartLoc(last->getEndTimeLoc(schOrActType));
    // debrief->setEndLoc(debrief->getStartLoc() + debriefMin * 60);
    // debrief->setStartUtc(last->getEndTimeUtc(schOrActType));
    // debrief->setEndUtc(debrief->getStartUtc() + debriefMin * 60);

    debrief->setAirport(last ? last->getArrSta() : duty->getArrivalStation());
    debrief->setGroupId(1);
    debrief->setSequence(3);
    debrief->setType("DUTY");
    debrief->setNode("DEBRIEF");
    return debrief;
}

void refreshDebriefNodeOfDutyThreadLocalTime(Duty * duty, const std::string& schOrActType, std::shared_ptr<PairingDutyNode> debriefNode) {

	auto debrief = debriefNode ? debriefNode : duty->getLastDebrief();
	if (!debrief) return;

	Segment* last = duty->getLastSegment();
	int debriefMin = duty->getActualDebriefMin();

	debrief->setStartLoc(last->getEndTimeLoc(schOrActType));
	debrief->setEndLoc(debrief->getStartLoc() + debriefMin * 60);
	debrief->setStartUtc(last->getEndTimeUtc(schOrActType));
	debrief->setEndUtc(debrief->getStartUtc() + debriefMin * 60);
}

/**
 * 创建Duty的Dropoff节点
 * @param duty
 * @param debrief
 * @param dbData
 * @param pg
 * @return
 */
shared_ptr<PairingDutyNode> createDropoffNodeOfDuty(Duty * duty, shared_ptr<PairingDutyNode> &debrief, CrewDataContext *dbData, Pairing* pg) {
    //2021.02.01 modified by zzm ,po duty calcualte pairingDutyNode
    Segment* last = duty->getLastSegment();

    shared_ptr<PairingDutyNode> dropoff(new PairingDutyNode);

    //20200417 ain, mantis#8073, savePO流程 dutyNode逻辑补齐 pairingId/dutyId/from|toSegmentId
    dropoff->setId(tmpIdGenerator.fetch_sub(1));

    // setup scenario id for output
    dropoff->setScenarioId(dbData->scenarioId);

    if (pg != nullptr) {
        dropoff->setPairingId(pg->getDbId());
    }
    else{
        dropoff->setPairingId(-duty->getId());
    }

    dropoff->setDutyId(duty->getDutyId());
    dropoff->setFromSegmentId(0);
    dropoff->setToSegmentId(0);
	refreshDropoffNodeOfDutyThreadLocalTime(duty, debrief, dropoff);
    // dropoff->setStartLoc(debrief->getEndLoc());
    // dropoff->setEndLoc(dropoff->getStartLoc() + dropoffMin * 60);
    // dropoff->setStartUtc(debrief->getEndUtc());
    // dropoff->setEndUtc(dropoff->getStartUtc() + dropoffMin * 60);

    dropoff->setAirport(last ? last->getArrSta() : duty->getArrivalStation());
    dropoff->setGroupId(1);
    dropoff->setSequence(4);
    dropoff->setType("DUTY");
    dropoff->setNode("DROPOFF");
    return dropoff;
}

void refreshDropoffNodeOfDutyThreadLocalTime(Duty * duty, shared_ptr<PairingDutyNode> debrief, std::shared_ptr<PairingDutyNode> dropoffNode) {

	auto dropoff = dropoffNode ? dropoffNode : duty->getLastDropoff();
	if (!dropoff) return;

	int dropoffMin = duty->getActualDropoffMin();
	dropoff->setStartLoc(debrief->getEndLoc());
	dropoff->setEndLoc(dropoff->getStartLoc() + dropoffMin * 60);
	dropoff->setStartUtc(debrief->getEndUtc());
	dropoff->setEndUtc(dropoff->getStartUtc() + dropoffMin * 60);
}

time_t getDutyBriefStartLocByRule(SharedPtr<CrewDataContext>& dbData, Duty* duty, const RecalDutyNodeFlag recalDutyNodeFlag) {
	int briefHour = 3;
	if (dbData->systemParamMap.find("ETD_BRIEF_RECAL_HR") != dbData->systemParamMap.end()) {
		briefHour = stoi(dbData->systemParamMap["ETD_BRIEF_RECAL_HR"]);
	}

	time_t brief_start = duty->getStartTimeLocAct();
	int briefMin = duty->getMinBrief();
	Segment* firstSeg = duty->getFirstSegment();
	if (firstSeg) {
		if ((recalDutyNodeFlag != RECAL_ALL && recalDutyNodeFlag != RECAL_BRIEF) && IsActualTakeOff(firstSeg, dbData)) {
			//航班实际起飞则不能修改签到时长
			return brief_start;
		}

		if ((recalDutyNodeFlag != RECAL_ALL && recalDutyNodeFlag != RECAL_BRIEF) && !IsChangeBriefOnTakeOffEarly(firstSeg, dbData)) {
			//航班提前起飞，不能修改签到时长
			return brief_start;
		}

		time_t STD = firstSeg->getStartTimeLocSch();
		if (firstSeg->getActBrief()) {
			STD = firstSeg->getStartTimeLocAct();
		}
		//当ETD变更时，若[“航班ETD” - “变更前的签到时间” 小于 “签到时长”(即：若不通过ETD重新计算签到时间，则无法满足 最小签到时长要求)] 
		// 或 [ETD变更时刻 距航班计划起飞时间 大于 briefHour （业务含义：航班ETD变更时刻 距离 航班计划起飞时间 小于 briefHour时间，则签到时间不变；否则签到时间通过ETD重新计算）] 则通过ETD重新计算签到开始时间
		if (firstSeg->getEtdChgTm() != 0 && ((firstSeg->getEstDepDtLoc() - brief_start) < briefMin * 60 || (firstSeg->getStartTimeUtcSch() - firstSeg->getEtdChgTm()) >= briefHour * 3600) ) {
			brief_start = firstSeg->getEstDepDtLoc() - briefMin * 60;
		}
		else if (firstSeg->getEtdChgTm() == 0 && STD - firstSeg->getLastModify()) {
			brief_start = STD - briefMin * 60;
		}
		
	}
	return brief_start;
}

time_t getDutyBriefStartUtcByRule(SharedPtr<CrewDataContext>& dbData, Duty* duty, const RecalDutyNodeFlag recalDutyNodeFlag) {
	int briefHour = 3;
	if (dbData->systemParamMap.find("ETD_BRIEF_RECAL_HR") != dbData->systemParamMap.end()) {
		briefHour = stoi(dbData->systemParamMap["ETD_BRIEF_RECAL_HR"]);
	}

	time_t brief_start = duty->getStartTimeUtcAct();
	int briefMin = duty->getMinBrief();
	Segment* firstSeg = duty->getFirstSegment();
	if (firstSeg) {
		if ((recalDutyNodeFlag != RECAL_ALL && recalDutyNodeFlag != RECAL_BRIEF) && IsActualTakeOff(firstSeg, dbData)) {
			//航班实际起飞则不能修改签到时长
			return brief_start;
		}

		if ((recalDutyNodeFlag != RECAL_ALL && recalDutyNodeFlag != RECAL_BRIEF) && !IsChangeBriefOnTakeOffEarly(firstSeg, dbData)) {
			//航班提前起飞，不能修改签到时长
			return brief_start;
		}

		time_t STD = firstSeg->getStartTimeLocSch();
		time_t STD_UTC = firstSeg->getStartTimeUtcSch();
		if (firstSeg->getActBrief()) {
			STD = firstSeg->getStartTimeLocAct();
			STD_UTC = firstSeg->getStartTimeUtcAct();
		}
		//当ETD变更时，若 [“航班ETD” - “变更前的签到时间” 小于 “签到时长”(即：若不通过ETD重新计算签到时间，则无法满足 最小签到时长要求)] 
		// 或 [ETD变更时刻 距航班计划起飞时间 大于 briefHour （业务含义：航班ETD变更时刻 距离 航班计划起飞时间 小于 briefHour时间，则签到时间不变；否则签到时间通过ETD重新计算）]  则通过ETD重新计算签到开始时间
		if (firstSeg->getEtdChgTm() != 0 && ((firstSeg->getEstDepDtUtc() - brief_start) < briefMin * 60 || (firstSeg->getStartTimeUtcSch() - firstSeg->getEtdChgTm()) >= briefHour * 3600) ) {
			brief_start = firstSeg->getEstDepDtUtc() - briefMin * 60;
		}
		else if (firstSeg->getEtdChgTm() == 0 && STD - firstSeg->getLastModify()) {
			brief_start = STD_UTC - briefMin * 60;
		}
	}

	return brief_start;
}

void createPairingNodeOfSeg(Pairing* pg, CrewDataContext *dbData) {
	if (!pg) {
		return;
	}
	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty* d = pg->getDuty(i);
		int ret = createPairingNodeOfSeg(d, dbData, pg); //2021.02.01 modified by zzm ,po duty calcualte pairingDutyNode
		if (ret == 1) {
			continue;
		}
	}

}

int createPairingNodeOfSeg(Duty* d, CrewDataContext *dbData, Pairing* pg) {
	//2021.02.01 modified by zzm ,po duty calcualte pairingDutyNode

	int f = 0;//用于标记pdn中是否存在segment层级的pdn
	for (auto pdn : d->pairingDutyNodes) {
		if (pdn->getType() == "SEGMENT") {
			f = 1;
			break;
		}
	}
	if (f == 1) return f;
	for (int j = 0; j < (int)d->getSegments().size() - 1; j++) {
		Segment* seg = d->getSegments()[j];
		//if (!seg->isLongTransitWithNext()) {
		//	continue;
		//}
		Segment* nextSeg = d->getSegments()[j + 1];
		if (RuleParams::GetInstancePtr()->getLongTransit(seg, nextSeg) == nullptr)
			continue;

		int pickupMin = nextSeg->getSplitDutyPickUpMin();
		int briefMin = nextSeg->getBriefTimeInsec() / 60; //20200423 ain, mantis#8130, 单位转换
		int debriefMin = seg->getDeBriefTimeInsec() / 60; //20200423 ain, mantis#8130, 单位转换
		int dropoffMin = seg->getSplitDutyDropOffMin();

		shared_ptr<PairingDutyNode> pickup(new PairingDutyNode);
		shared_ptr<PairingDutyNode> brief(new PairingDutyNode);
		shared_ptr<PairingDutyNode> debrief(new PairingDutyNode);
		shared_ptr<PairingDutyNode> dropoff(new PairingDutyNode);

		//20200417 ain, mantis#8073, savePO流程 dutyNode逻辑补齐 pairingId/dutyId/from|toSegmentId
		pickup->setId(tmpIdGenerator.fetch_sub(1));
		brief->setId(tmpIdGenerator.fetch_sub(1));
		debrief->setId(tmpIdGenerator.fetch_sub(1));
		dropoff->setId(tmpIdGenerator.fetch_sub(1));

		// setup scenario id for output
		pickup->setScenarioId(dbData->scenarioId);
		brief->setScenarioId(dbData->scenarioId);
		debrief->setScenarioId(dbData->scenarioId);
		dropoff->setScenarioId(dbData->scenarioId);

		if (pg != nullptr) {
			pickup->setPairingId(pg->getDbId());
			brief->setPairingId(pg->getDbId());
			debrief->setPairingId(pg->getDbId());
			dropoff->setPairingId(pg->getDbId());
		}
		else {
			pickup->setPairingId(-d->getId()); //PO阶段组duty未生成pairing，取dutyId的负数
			brief->setPairingId(-d->getId());
			debrief->setPairingId(-d->getId());
			dropoff->setPairingId(-d->getId());
		}

		pickup->setDutyId(d->getDutyId());
		brief->setDutyId(d->getDutyId());
		debrief->setDutyId(d->getDutyId());
		dropoff->setDutyId(d->getDutyId());
		pickup->setFromSegmentId(seg->getDBId());
		brief->setFromSegmentId(seg->getDBId());
		debrief->setFromSegmentId(seg->getDBId());
		dropoff->setFromSegmentId(seg->getDBId());
		pickup->setToSegmentId(nextSeg->getDBId());
		brief->setToSegmentId(nextSeg->getDBId());
		debrief->setToSegmentId(nextSeg->getDBId());
		dropoff->setToSegmentId(nextSeg->getDBId());

		brief->setEndLoc(nextSeg->getStartTimeLocAct() <= 0 ? nextSeg->getStartTimeLocSch() : nextSeg->getStartTimeLocAct());
		brief->setStartLoc(brief->getEndLoc() - briefMin * 60);
        brief->setEndUtc(nextSeg->getStartTimeUtcAct() <= 0 ? nextSeg->getStartTimeUtcSch() : nextSeg->getStartTimeUtcSch());
        brief->setStartUtc(brief->getEndUtc() - briefMin * 60);

		pickup->setEndLoc(brief->getStartLoc());
		pickup->setStartLoc(pickup->getEndLoc() - pickupMin * 60);
        pickup->setEndUtc(brief->getStartUtc());
        pickup->setStartUtc(pickup->getEndUtc() - pickupMin * 60);

		debrief->setStartLoc(seg->getEndTimeLocAct() <= 0 ? seg->getEndTimeLocSch() : seg->getEndTimeLocAct());
		debrief->setEndLoc(debrief->getStartLoc() + debriefMin * 60);
        debrief->setStartUtc(seg->getEndTimeUtcAct() <= 0 ? seg->getEndTimeUtcSch() : seg->getEndTimeUtcAct());
        debrief->setEndUtc(debrief->getStartUtc() + debriefMin * 60);

		dropoff->setStartLoc(debrief->getEndLoc());
		dropoff->setEndLoc(dropoff->getStartLoc() + dropoffMin * 60);
        dropoff->setStartUtc(debrief->getEndUtc());
        dropoff->setEndUtc(dropoff->getStartUtc() + dropoffMin * 60);

		pickup->setAirport(nextSeg->getDepSta());
		pickup->setGroupId(2);
		pickup->setSequence(1);
		pickup->setType("SEGMENT");
		pickup->setNode("PICKUP");

		brief->setAirport(nextSeg->getDepSta());
		brief->setGroupId(2);
		brief->setSequence(2);
		brief->setType("SEGMENT");
		brief->setNode("BRIEF");

		debrief->setAirport(seg->getArrSta());
		debrief->setGroupId(2);
		debrief->setSequence(3);
		debrief->setType("SEGMENT");
		debrief->setNode("DEBRIEF");

		dropoff->setAirport(seg->getArrSta());
		dropoff->setGroupId(2);
		dropoff->setSequence(4);
		dropoff->setType("SEGMENT");
		dropoff->setNode("DROPOFF");

		d->pairingDutyNodes.push_back(pickup);
		d->pairingDutyNodes.push_back(brief);
		d->pairingDutyNodes.push_back(debrief);
		d->pairingDutyNodes.push_back(dropoff);

		//20200423 ain, mantis#8144, 按arp/loc赋值 utc
//		setPairingNodeUtc(pickup, dbData);
//		setPairingNodeUtc(brief, dbData);
//		setPairingNodeUtc(debrief, dbData);
//		setPairingNodeUtc(dropoff, dbData);
	}
	return f;
}

//在fromSegment和toSegment之间SEGMENT节点的签到和签出，fromSegment航班签出，toSegment航班签到
int createPairingNodeOfSeg(Duty* duty, Segment* fromSegment, Segment* toSegment, const int briefMinutes, const int debriefMinutes, CrewDataContext* dbData) {

	//TODO 还需要考虑更新和删除，目前只有新增

	int pickupMin = 0;
	int briefMin = briefMinutes;
	int debriefMin = debriefMinutes;
	int dropoffMin = 0;

	toSegment->setSplitDutyPickUpMin(pickupMin);
	toSegment->setBriefTimeInsec(briefMin * 60);
	fromSegment->setDeBriefTimeInsec(debriefMin * 60);
	fromSegment->setSplitDutyDropOffMin(dropoffMin);

	long long maxGroupId = -9999;
	for (auto& node : duty->pairingDutyNodes) {
		if (node->getGroupId() > maxGroupId) {
			maxGroupId = node->getGroupId();
		}
	}
	
	shared_ptr<PairingDutyNode> pickup = Utility::GetInstancePtr()->getPairingDutyNodeOfSeg(duty->pairingDutyNodes, "PICKUP", fromSegment->getDBId(), toSegment->getDBId());
	if (pickup == nullptr) {
		pickup = std::make_shared<PairingDutyNode>();
		pickup->setId(tmpIdGenerator.fetch_sub(1));
		pickup->setScenarioId(dbData->scenarioId);
		pickup->setPairingId(duty->getPairingId());
		pickup->setDutyId(duty->getDutyId());
		pickup->setFromSegmentId(fromSegment->getDBId());
		pickup->setToSegmentId(toSegment->getDBId());

		pickup->setAirport(toSegment->getDepSta());
		pickup->setGroupId(maxGroupId + 1);
		pickup->setSequence(1);
		pickup->setType("SEGMENT");
		pickup->setNode("PICKUP");

		duty->pairingDutyNodes.push_back(pickup);
	}

	shared_ptr<PairingDutyNode> brief = Utility::GetInstancePtr()->getPairingDutyNodeOfSeg(duty->pairingDutyNodes, "BRIEF", fromSegment->getDBId(), toSegment->getDBId());
	if (brief == nullptr) {
		brief = std::make_shared<PairingDutyNode>();
		brief->setId(tmpIdGenerator.fetch_sub(1));
		brief->setScenarioId(dbData->scenarioId);
		brief->setPairingId(duty->getPairingId());
		brief->setDutyId(duty->getDutyId());
		brief->setFromSegmentId(fromSegment->getDBId());
		brief->setToSegmentId(toSegment->getDBId());

		brief->setAirport(toSegment->getDepSta());
		brief->setGroupId(maxGroupId + 1);
		brief->setSequence(2);
		brief->setType("SEGMENT");
		brief->setNode("BRIEF");

		duty->pairingDutyNodes.push_back(brief);
	}

	shared_ptr<PairingDutyNode> debrief = Utility::GetInstancePtr()->getPairingDutyNodeOfSeg(duty->pairingDutyNodes, "DEBRIEF", fromSegment->getDBId(), toSegment->getDBId());
	if (debrief == nullptr) {
		debrief = std::make_shared<PairingDutyNode>();
		debrief->setId(tmpIdGenerator.fetch_sub(1));
		debrief->setScenarioId(dbData->scenarioId);
		debrief->setPairingId(duty->getPairingId());
		debrief->setDutyId(duty->getDutyId());
		debrief->setFromSegmentId(fromSegment->getDBId());
		debrief->setToSegmentId(toSegment->getDBId());

		debrief->setAirport(fromSegment->getArrSta());
		debrief->setGroupId(maxGroupId + 1);
		debrief->setSequence(3);
		debrief->setType("SEGMENT");
		debrief->setNode("DEBRIEF");

		duty->pairingDutyNodes.push_back(debrief);
	}

	shared_ptr<PairingDutyNode> dropoff = Utility::GetInstancePtr()->getPairingDutyNodeOfSeg(duty->pairingDutyNodes, "DROPOFF", fromSegment->getDBId(), toSegment->getDBId());
	if (dropoff == nullptr) {
		dropoff = std::make_shared<PairingDutyNode>();
		dropoff->setId(tmpIdGenerator.fetch_sub(1));
		dropoff->setScenarioId(dbData->scenarioId);
		dropoff->setPairingId(duty->getPairingId());
		dropoff->setDutyId(duty->getDutyId());
		dropoff->setFromSegmentId(fromSegment->getDBId());
		dropoff->setToSegmentId(toSegment->getDBId());

		dropoff->setAirport(fromSegment->getArrSta());
		dropoff->setGroupId(maxGroupId + 1);
		dropoff->setSequence(4);
		dropoff->setType("SEGMENT");
		dropoff->setNode("DROPOFF");

		duty->pairingDutyNodes.push_back(dropoff);
	}
	
	// setup scenario id for output
	brief->setEndLoc(toSegment->getStartTimeLocAct() <= 0 ? toSegment->getStartTimeLocSch() : toSegment->getStartTimeLocAct());
	brief->setStartLoc(brief->getEndLoc() - (time_t)briefMin * 60);
	brief->setEndUtc(toSegment->getStartTimeUtcAct() <= 0 ? toSegment->getStartTimeUtcSch() : toSegment->getStartTimeUtcSch());
	brief->setStartUtc(brief->getEndUtc() - (time_t)briefMin * 60);

	pickup->setEndLoc(brief->getStartLoc());
	pickup->setStartLoc(pickup->getEndLoc() - (time_t)pickupMin * 60);
	pickup->setEndUtc(brief->getStartUtc());
	pickup->setStartUtc(pickup->getEndUtc() - pickupMin * 60);

	debrief->setStartLoc(fromSegment->getEndTimeLocAct() <= 0 ? fromSegment->getEndTimeLocSch() : fromSegment->getEndTimeLocAct());
	debrief->setEndLoc(debrief->getStartLoc() + (time_t)debriefMin * 60);
	debrief->setStartUtc(fromSegment->getEndTimeUtcAct() <= 0 ? fromSegment->getEndTimeUtcSch() : fromSegment->getEndTimeUtcAct());
	debrief->setEndUtc(debrief->getStartUtc() + (time_t)debriefMin * 60);

	dropoff->setStartLoc(debrief->getEndLoc());
	dropoff->setEndLoc(dropoff->getStartLoc() + (time_t)dropoffMin * 60);
	dropoff->setStartUtc(debrief->getEndUtc());
	dropoff->setEndUtc(dropoff->getStartUtc() + (time_t)dropoffMin * 60);

	return 0;
}


int createPairingNodeOfSegByRuleParam(Duty* d, CrewDataContext *dbData, Pairing* pg) {
	//2021.02.01 modified by zzm ,po duty calcualte pairingDutyNode

	int f = 0;//用于标记pdn中是否存在segment层级的pdn
	for (auto pdn : d->pairingDutyNodes) {
		if (pdn->getType() == "SEGMENT") {
			f = 1;
			break;
		}
	}
	if (f == 1) return f;
	for (int j = 0; j < (int)d->getSegments().size() - 1; j++) {
		Segment* seg = d->getSegments()[j];

		Segment* nextSeg = d->getSegments()[j + 1];

		long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(seg, nextSeg);
		if (!longTransit) continue;

		int pickupMin = longTransit->pseudoPickup;
		int briefMin = longTransit->pseudoCI; //20200423 ain, mantis#8130, 单位转换
		int debriefMin = longTransit->pseudoCO; //20200423 ain, mantis#8130, 单位转换
		int dropoffMin = longTransit->pseudoDropoff;

		shared_ptr<PairingDutyNode> pickup(new PairingDutyNode);
		shared_ptr<PairingDutyNode> brief(new PairingDutyNode);
		shared_ptr<PairingDutyNode> debrief(new PairingDutyNode);
		shared_ptr<PairingDutyNode> dropoff(new PairingDutyNode);

		//20200417 ain, mantis#8073, savePO流程 dutyNode逻辑补齐 pairingId/dutyId/from|toSegmentId
		pickup->setId(tmpIdGenerator.fetch_sub(1));
		brief->setId(tmpIdGenerator.fetch_sub(1));
		debrief->setId(tmpIdGenerator.fetch_sub(1));
		dropoff->setId(tmpIdGenerator.fetch_sub(1));

		// setup scenario id for output
		pickup->setScenarioId(dbData->scenarioId);
		brief->setScenarioId(dbData->scenarioId);
		debrief->setScenarioId(dbData->scenarioId);
		dropoff->setScenarioId(dbData->scenarioId);

		if (pg != nullptr) {
			pickup->setPairingId(pg->getDbId());
			brief->setPairingId(pg->getDbId());
			debrief->setPairingId(pg->getDbId());
			dropoff->setPairingId(pg->getDbId());
		}
		else {
			pickup->setPairingId(-d->getId()); //PO阶段组duty未生成pairing，取dutyId的负数
			brief->setPairingId(-d->getId());
			debrief->setPairingId(-d->getId());
			dropoff->setPairingId(-d->getId());
		}

		pickup->setDutyId(d->getDutyId());
		brief->setDutyId(d->getDutyId());
		debrief->setDutyId(d->getDutyId());
		dropoff->setDutyId(d->getDutyId());
		pickup->setFromSegmentId(seg->getDBId());//实际是FlightId
		brief->setFromSegmentId(seg->getDBId());//实际是FlightId
		debrief->setFromSegmentId(seg->getDBId());//实际是FlightId
		dropoff->setFromSegmentId(seg->getDBId());//实际是FlightId
		pickup->setToSegmentId(nextSeg->getDBId());//实际是FlightId
		brief->setToSegmentId(nextSeg->getDBId());//实际是FlightId
		debrief->setToSegmentId(nextSeg->getDBId());//实际是FlightId
		dropoff->setToSegmentId(nextSeg->getDBId());//实际是FlightId

		brief->setEndLoc(nextSeg->getStartTimeLocAct());
		brief->setStartLoc(brief->getEndLoc() - briefMin * 60);
        brief->setEndUtc(nextSeg->getStartTimeUtcAct());
        brief->setStartUtc(brief->getEndUtc() - briefMin * 60);

		pickup->setEndLoc(brief->getStartLoc());
		pickup->setStartLoc(pickup->getEndLoc() - pickupMin * 60);
        pickup->setEndUtc(brief->getStartUtc());
        pickup->setStartUtc(pickup->getEndUtc() - pickupMin * 60);

		debrief->setStartLoc(seg->getEndTimeLocAct());
		debrief->setEndLoc(debrief->getStartLoc() + debriefMin * 60);
        debrief->setStartUtc(seg->getEndTimeUtcAct());
        debrief->setEndUtc(debrief->getStartUtc() + debriefMin * 60);

		dropoff->setStartLoc(debrief->getEndLoc());
		dropoff->setEndLoc(dropoff->getStartLoc() + dropoffMin * 60);
        dropoff->setStartUtc(debrief->getEndUtc());
        dropoff->setEndUtc(dropoff->getStartUtc() + dropoffMin * 60);

		pickup->setAirport(nextSeg->getDepSta());
		pickup->setGroupId(2);
		pickup->setSequence(1);
		pickup->setType("SEGMENT");
		pickup->setNode("PICKUP");

		brief->setAirport(nextSeg->getDepSta());
		brief->setGroupId(2);
		brief->setSequence(2);
		brief->setType("SEGMENT");
		brief->setNode("BRIEF");

		debrief->setAirport(seg->getArrSta());
		debrief->setGroupId(2);
		debrief->setSequence(3);
		debrief->setType("SEGMENT");
		debrief->setNode("DEBRIEF");

		dropoff->setAirport(seg->getArrSta());
		dropoff->setGroupId(2);
		dropoff->setSequence(4);
		dropoff->setType("SEGMENT");
		dropoff->setNode("DROPOFF");

		d->pairingDutyNodes.push_back(pickup);
		d->pairingDutyNodes.push_back(brief);
		d->pairingDutyNodes.push_back(debrief);
		d->pairingDutyNodes.push_back(dropoff);

		//20200423 ain, mantis#8144, 按arp/loc赋值 utc

//		setPairingNodeUtc(pickup, dbData);
//		setPairingNodeUtc(brief, dbData);
//		setPairingNodeUtc(debrief, dbData);
//		setPairingNodeUtc(dropoff, dbData);
	}

	return f;
}

////遍历pg下属 dutyNode，按arp/loc赋值utc
//void setPairingNodeUtc(shared_ptr<PairingDutyNode>& n, CrewDataContext *dbData) {
//
//	int offsetMinutes = 0;
//	if (dbData) {
//		try {
//			offsetMinutes = dbData->getAirportOffsetMinutes(n->getAirport());
//		}
//		catch (...) {
//			cout << "ERROR: airport=" << n->getAirport() << " not found";
//		}
//	}
//	n->setStartUtc(n->getStartLoc() - offsetMinutes * 60);
//	n->setEndUtc(n->getEndLoc() - offsetMinutes * 60);
//
//}