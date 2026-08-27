#include "DebugUtils.h"

#include "Log/Logger.h"

std::shared_ptr<DebugUtils> _debugUtils = nullptr;

std::shared_ptr<DebugUtils>& DebugUtils::getInstance() {
	if (_debugUtils == nullptr) {
		_debugUtils = std::make_shared<DebugUtils>();
		_debugUtils->setEnabled(true);
	}
	return _debugUtils;
}

void DebugUtils::output(const vector<Pairing*>& pairingList, const vector<long long> pairingIds, const string logPrefix) {
	if (!isEnabled()) {
		return;
	}
	for (auto& pairing : pairingList) {
		if (pairingIds.empty() || std::find(pairingIds.begin(), pairingIds.end(), pairing->getDbId()) != pairingIds.end()) {
			DebugUtils::output(pairing, logPrefix);
		}
	}
}

void DebugUtils::output(const Pairing* pairing, const string logPrefix) {
	if (!isEnabled()) {
		return;
	}
	for (auto& duty : pairing->getDutyVec()) {
		DebugUtils::output(duty, logPrefix);
	}
}

void DebugUtils::output(const Duty* duty, const string logPrefix) {
	if (!isEnabled()) {
		return;
	}
	DebugUtils::output(duty, duty->pairingDutyNodes, logPrefix);
}

void DebugUtils::output(const Duty* duty, const vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes, const string logPrefix) {
	if (!isEnabled()) {
		return;
	}
	if (pairingDutyNodes.size() < 4) {
		Logger::getRuleLogger()->error("[Debug][{}] pairingDutyNode size ({}) error.pairingId={}, dutyId={}", logPrefix, pairingDutyNodes.size(), duty->getPairingId(), duty->getDutyId());
	}
	for (auto& pairingDutyNode : pairingDutyNodes) {
		if (pairingDutyNode == nullptr) {
			Logger::getRuleLogger()->error("[Debug][{}] pairingDutyNode is null. pairingId={}, dutyId={}", logPrefix, duty->getPairingId(), duty->getDutyId());
			continue;
		}
		DebugUtils::output(duty, pairingDutyNode, logPrefix);

	}
}

void DebugUtils::output(const Duty* duty, const shared_ptr<PairingDutyNode>& pairingDutyNode, const string logPrefix) {
	if (!isEnabled()) {
		return;
	}
	long long MIN_TIMESTAMP = 0, MAX_TIMESTAMP = 253370764800;
	/*if (pairingDutyNode->getStartUtc() < MIN_TIMESTAMP || pairingDutyNode->getStartUtc() > MAX_TIMESTAMP
		|| pairingDutyNode->getEndUtc() < MIN_TIMESTAMP || pairingDutyNode->getEndUtc() > MAX_TIMESTAMP
		|| pairingDutyNode->getStartLoc() < MIN_TIMESTAMP || pairingDutyNode->getStartLoc() > MAX_TIMESTAMP
		|| pairingDutyNode->getEndLoc() < MIN_TIMESTAMP || pairingDutyNode->getEndLoc() > MAX_TIMESTAMP) {*/
	Logger::getRuleLogger()->debug("[Debug][{}] type={}, node={}, airport={}, startUtc={}, endUtc={}, startLoc={}, endLoc={},. pairingId={}, dutyId={}",
		logPrefix,
		pairingDutyNode->getType(), pairingDutyNode->getNode(), pairingDutyNode->getAirport(),
		pairingDutyNode->getStartUtc(), pairingDutyNode->getEndUtc(), pairingDutyNode->getStartLoc(), pairingDutyNode->getEndLoc(),
		pairingDutyNode->getPairingId(), pairingDutyNode->getDutyId());
	//}
}

void DebugUtils::output(const long long pairingId, SharedPtr<CrewDataContext>& dbData, const string logPrefix) {
	if (!isEnabled()) {
		return;
	}
	auto iter = dbData->pairingIdMap.find(pairingId);
	if (iter == dbData->pairingIdMap.end()) {
		Logger::getRuleLogger()->warn("[Debug][{}] pairing do not exist. pariringId={}", logPrefix, pairingId);
		return;
	}
	DebugUtils::output(iter->second, logPrefix);
}


void DebugUtils::output(const Duty* duty, const vector<Segment*>& segments, const string logPrefix) {
	if (!isEnabled()) {
		return;
	}
	for (auto& segment : segments) {
		DebugUtils::output(duty, segment, logPrefix);
	}
}

void DebugUtils::output(const Duty* duty, const Segment* segment, const string logPrefix) {
	if (!isEnabled()) {
		return;
	}
	Logger::getRuleLogger()->debug("[Debug][{}] duty minBrief={}, pairingId={}, dutyId={}", logPrefix, duty->getMinBrief(), duty->getPairingId(), duty->getDutyId());
	Logger::getRuleLogger()->debug("[Debug][{}] startUtcAct={}, endUtcAct={}, startLocAct={}, endLocAct={}, startUtcEst={}, endUtcEst={}, startLocEst={}, endLocEst={}, "
		"startUtcSch={}, endUtcSch={}, startLocSch={}, endLocSch={} pairingId={}, dutyId={}",
		logPrefix,
		segment->getStartTimeUtcAct(), segment->getEndTimeUtcAct(), segment->getStartTimeLocAct(), segment->getEndTimeLocAct(),
		segment->getEstDepDtUtc(), segment->getEstArvDtUtc(), segment->getEstDepDtLoc(), segment->getEstArvDtLoc(),
		segment->getStartTimeUtcSch(), segment->getEndTimeUtcSch(), segment->getStartTimeLocSch(), segment->getEndTimeLocSch(),
		segment->getPairingId(), segment->getDutyId());
}