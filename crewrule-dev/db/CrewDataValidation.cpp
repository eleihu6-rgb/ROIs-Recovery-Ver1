#include "CrewDataValidation.h"

#include "CrewDB.h"
#include "Log/Logger.h"


void fixPairingDuty(CrewDataContext* dbData);

void fixPairingDuty(std::shared_ptr<CrewDataContext>& dbData);

void fixPairingDutyNode(Duty* duty);


void fixPairingDuty(std::shared_ptr<CrewDataContext>& dbData) {
	fixPairingDuty(dbData.get());
}

void fixPairingDuty(CrewDataContext* dbData) {
	for (auto& pair : dbData->pairingIdMap) {
		auto& pairing = pair.second;
		if (pairing) {
			fixPairingDuty(pairing);
		}
	}
}

void fixPairingDuty(Pairing* pairing) {
	for (auto& duty : pairing->getDutyVec()) {
		fixPairingDutyNode(duty);

		if (duty->getStartTimeLocAct() <= 0) {
			duty->setStartTimeLocAct(duty->getFirstBreif()->getStartTimeLocAct());
			Logger::getRuleLogger()->error("[DataCheck] invalid data, duty startTimeLocAct = 0, fix value = {}, pairingId:{}, dutyId={}.",
				duty->getFirstBreif()->getStartTimeLocAct(), duty->getPairingId(), duty->getDutyId());
		}

		if (duty->getStartTimeLocSch() <= 0) {
			duty->setStartTimeLocSch(duty->getFirstBreif()->getStartTimeLocSch());
			Logger::getRuleLogger()->error("[DataCheck] invalid data, duty startTimeLocSch = 0, fix value = {}, pairingId:{}, dutyId={}.",
				duty->getFirstBreif()->getStartTimeLocSch(), duty->getPairingId(), duty->getDutyId());
		}

		if (duty->getStartTimeUtcAct() <= 0) {
			duty->setStartTimeUtcAct(duty->getFirstBreif()->getStartTimeUtcAct());
			Logger::getRuleLogger()->error("[DataCheck] invalid data, duty startTimeUtcAct = 0, fix value = {}, pairingId:{}, dutyId={}.",
				duty->getFirstBreif()->getStartTimeUtcAct(), duty->getPairingId(), duty->getDutyId());
		}

		if (duty->getStartTimeUtcSch() <= 0) {
			duty->setStartTimeUtcSch(duty->getFirstBreif()->getStartTimeUtcSch());
			Logger::getRuleLogger()->error("[DataCheck] invalid data, duty startTimeUtcSch = 0, fix value = {}, pairingId:{}, dutyId={}.",
				duty->getFirstBreif()->getStartTimeUtcSch(), duty->getPairingId(), duty->getDutyId());
		}
	}

	if (!pairing->getDutyVec().empty()) {
		auto firstDuty = pairing->getFirstDuty();
		if (pairing->getStartTimeLocAct() <= 0) {
			pairing->setStartTimeLocAct(firstDuty->getStartTimeLocAct());
			Logger::getRuleLogger()->error("[DataCheck] invalid data, pairing startTimeLocAct = 0, fix value = {}, pairingId:{}.",
				firstDuty->getStartTimeLocAct(), pairing->getDbId());
		}

		if (pairing->getStartTimeLocSch() <= 0) {
			pairing->setStartTimeLocSch(firstDuty->getStartTimeLocSch());
			Logger::getRuleLogger()->error("[DataCheck] invalid data, pairing startTimeLocSch = 0, fix value = {}, pairingId:{}.",
				firstDuty->getStartTimeLocSch(), pairing->getDbId());
		}

		if (pairing->getStartTimeUtcAct() <= 0) {
			pairing->setStartTimeUtcAct(firstDuty->getStartTimeUtcAct());
			Logger::getRuleLogger()->error("[DataCheck] invalid data, pairing startTimeUtcAct = 0, fix value = {}, pairingId:{}.",
				firstDuty->getStartTimeUtcAct(), pairing->getDbId());
		}

		if (pairing->getStartTimeUtcSch() <= 0) {
			pairing->setStartTimeUtcSch(firstDuty->getStartTimeUtcSch());
			Logger::getRuleLogger()->error("[DataCheck] invalid data, pairing startTimeUtcSch = 0, fix value = {}, pairingId:{}.",
				firstDuty->getStartTimeUtcSch(), pairing->getDbId());
		}
	}

}

void fixPairingDutyNode(Duty* duty) {
	for (auto& pdn : duty->pairingDutyNodes) {
		time_t nodeStartUtc = pdn->getStartUtc();
		time_t nodeEndUtc = pdn->getEndUtc();
		time_t nodeStartLoc = pdn->getStartLoc();
		time_t nodeEndLoc = pdn->getEndLoc();

		auto [fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc] = getFixedDutyNodeTime(duty, pdn);
		if (nodeStartUtc != fixedNodeStartUtc) {
			pdn->setStartUtc(fixedNodeStartUtc);
			Logger::getRuleLogger()->error("[DataCheck] invalid data, fix startUtc {} {} dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				pdn->getType(), pdn->getNode(), duty->getDutyId(), fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc);
		}
		if (nodeEndUtc != fixedNodeEndUtc) {
			pdn->setEndUtc(fixedNodeEndUtc);
			Logger::getRuleLogger()->error("[DataCheck] invalid data, fix endUtc {} {} dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				pdn->getType(), pdn->getNode(), duty->getDutyId(), fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc);
		}
		if (nodeStartLoc != fixedNodeStartLoc) {
			pdn->setStartLoc(fixedNodeStartLoc);
			Logger::getRuleLogger()->error("[DataCheck] invalid data, fix startLoc {} {} dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				pdn->getType(), pdn->getNode(), duty->getDutyId(), fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc);
		}
		if (nodeEndLoc != fixedNodeEndLoc) {
			pdn->setEndLoc(fixedNodeEndLoc);
			Logger::getRuleLogger()->error("[DataCheck] invalid data, fix endLoc {} {} dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				pdn->getType(), pdn->getNode(), duty->getDutyId(), fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc);
		}
	}
}



std::tuple<time_t,time_t,time_t,time_t> getFixedDutyNodeTime(Duty* duty, shared_ptr<PairingDutyNode>& pdn) {
	time_t nodeStartUtc = pdn->getStartUtc();
	time_t nodeEndUtc = pdn->getEndUtc();
	time_t nodeStartLoc = pdn->getStartLoc();
	time_t nodeEndLoc = pdn->getEndLoc();

	auto firstSeg = duty->getFirstSegment();

	if (firstSeg == nullptr) {
		Logger::getRuleLogger()->error("[DataCheck] invalid data, duty doesn't exist segment. first segment is null. dutyId={} pairingId={}.",
				duty->getDutyId(), duty->getPairingId());
		return std::make_tuple(nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
	}

	if (pdn->getType() == "DUTY" && pdn->getNode() == "PICKUP") {
		time_t startUtc = firstSeg->getStartTimeUtcSch();
		time_t startLoc = firstSeg->getStartTimeLocSch();

		int delta = static_cast<int>(startUtc - nodeStartUtc);
		if (delta <= 0 && delta > MAX_BRIEF_IN_SECS) {
			int defaultBriefInSecs = firstSeg->getDomIntType() == "D" ? DEFAULT_DOM_DUTY_BRIEF_IN_SECS : DEFAULT_INT_DUTY_BRIEF_IN_SECS;
			int defaultPickupInSecs = firstSeg->getDomIntType() == "D" ? DEFAULT_DOM_DUTY_PICKUP_IN_SECS : DEFAULT_INT_DUTY_PICKUP_IN_SECS;
			Logger::getRuleLogger()->error("[DataCheck] invalid data, duty pickup dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				duty->getDutyId(), nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
			nodeStartUtc = startUtc - defaultBriefInSecs - defaultPickupInSecs;
			nodeStartLoc = startLoc - defaultBriefInSecs - defaultPickupInSecs;
			nodeEndUtc = startUtc - defaultBriefInSecs;
			nodeEndLoc = startLoc - defaultBriefInSecs;
			Logger::getRuleLogger()->error("[DataCheck] invalid data, fixed duty pickup dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				duty->getDutyId(), nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
		}
	}
	else if (pdn->getType() == "DUTY" && pdn->getNode() == "BRIEF") {
		time_t startUtc = firstSeg->getStartTimeUtcSch();
		time_t startLoc = firstSeg->getStartTimeLocSch();

		int delta = static_cast<int>(startUtc - nodeStartUtc);
		if (delta <= 0 && delta > MAX_BRIEF_IN_SECS) {
			int defaultBriefInSecs = firstSeg->getDomIntType() == "D" ? DEFAULT_DOM_DUTY_BRIEF_IN_SECS : DEFAULT_INT_DUTY_BRIEF_IN_SECS;
			Logger::getRuleLogger()->error("[DataCheck] invalid data, duty brief dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				duty->getDutyId(), nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
			nodeStartUtc = startUtc - defaultBriefInSecs;
			nodeStartLoc = startLoc - defaultBriefInSecs;
			nodeEndUtc = startUtc;
			nodeEndLoc = startLoc;
			Logger::getRuleLogger()->error("[DataCheck] invalid data, fixed duty brief dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				duty->getDutyId(), nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
		}
	}
	else if (pdn->getType() == "DUTY" && pdn->getNode() == "DEBRIEF") {
		//TODO
	}
	else if (pdn->getType() == "DUTY" && pdn->getNode() == "DROPOFF") {
		//TODO
	}
	else if (pdn->getType() == "SEGMENT" && pdn->getNode() == "PICKUP") {
		time_t startUtc = firstSeg->getStartTimeUtcSch();
		time_t startLoc = firstSeg->getStartTimeLocSch();
		for (auto& seg : duty->getSegments()) {
			if (seg->getSegmentId() == pdn->getToSegmentId()) {
				startUtc = seg->getStartTimeUtcSch();
				startLoc = seg->getStartTimeLocSch();
				break;
			}
		}

		int delta = static_cast<int>(startUtc - nodeStartUtc);
		if (delta <= 0 && delta > MAX_BRIEF_IN_SECS) {
			int defaultBriefInSecs = firstSeg->getDomIntType() == "D" ? DEFAULT_DOM_SEGMENT_BRIEF_IN_SECS : DEFAULT_INT_SEGMENT_BRIEF_IN_SECS;
			int defaultPickupInSecs = firstSeg->getDomIntType() == "D" ? DEFAULT_DOM_SEGMENT_PICKUP_IN_SECS : DEFAULT_INT_SEGMENT_PICKUP_IN_SECS;
			Logger::getRuleLogger()->error("[DataCheck] invalid data, segment pickup dutyId={} fromSegmentId={} toSegmentId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				duty->getDutyId(), pdn->getFromSegmentId(), pdn->getToSegmentId(), nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
			nodeStartUtc = startUtc - defaultBriefInSecs - defaultPickupInSecs;
			nodeStartLoc = startLoc - defaultBriefInSecs - defaultPickupInSecs;
			nodeEndUtc = startUtc - defaultBriefInSecs;
			nodeEndLoc = startLoc - defaultBriefInSecs;
			Logger::getRuleLogger()->error("[DataCheck] invalid data, fixed segment pickup dutyId={} fromSegmentId={} toSegmentId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				duty->getDutyId(), pdn->getFromSegmentId(), pdn->getToSegmentId(), nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
		}

	}
	else if (pdn->getType() == "SEGMENT" && pdn->getNode() == "BRIEF") {
		time_t startUtc = firstSeg->getStartTimeUtcSch();
		time_t startLoc = firstSeg->getStartTimeLocSch();
		for (auto& seg : duty->getSegments()) {
			if (seg->getSegmentId() == pdn->getToSegmentId()) {
				startUtc = seg->getStartTimeUtcSch();
				startLoc = seg->getStartTimeLocSch();
				break;
			}
		}
		int delta = static_cast<int>(startUtc - nodeStartUtc);
		if (delta <= 0 && delta > MAX_BRIEF_IN_SECS) {
			int defaultBriefInSecs = firstSeg->getDomIntType() == "D" ? DEFAULT_DOM_SEGMENT_BRIEF_IN_SECS : DEFAULT_INT_SEGMENT_BRIEF_IN_SECS;
			Logger::getRuleLogger()->error("[DataCheck] invalid data, segment brief dutyId={} fromSegmentId={} toSegmentId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				duty->getDutyId(), pdn->getFromSegmentId(), pdn->getToSegmentId(), nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
			nodeStartUtc = startUtc - defaultBriefInSecs;
			nodeStartLoc = startLoc - defaultBriefInSecs;
			nodeEndUtc = startUtc;
			nodeEndLoc = startLoc;
			Logger::getRuleLogger()->error("[DataCheck] invalid data, fixed segment brief dutyId={} fromSegmentId={} toSegmentId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
				duty->getDutyId(), pdn->getFromSegmentId(), pdn->getToSegmentId(), nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
		}
	}
	else if (pdn->getType() == "SEGMENT" && pdn->getNode() == "DEBRIEF") {
		//TODO
	}
	else if (pdn->getType() == "SEGMENT" && pdn->getNode() == "DROPOFF") {
		//TODO
	}

	return std::make_tuple(nodeStartUtc, nodeEndUtc, nodeStartLoc, nodeEndLoc);
}