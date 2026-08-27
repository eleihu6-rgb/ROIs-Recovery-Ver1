#pragma once

#include "CrewDB.h"

class DebugUtils {

public:
	static std::shared_ptr<DebugUtils>& getInstance();

	void setEnabled(const bool enabled) { _enabled = enabled; }

	bool isEnabled() const { return _enabled; }

	void output(const vector<Pairing*>& pairingList, const vector<long long> pairingIds = vector<long long>(), const string logPrefix = "COMMOON");
	void output(const Pairing* pairing, const string logPrefix = "COMMOON");
	void output(const Duty* duty, const string logPrefix = "COMMOON");
	void output(const Duty* duty, const vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes, const string logPrefix = "COMMOON");
	void output(const Duty* duty, const shared_ptr<PairingDutyNode>& pairingDutyNode, const string logPrefix = "COMMOON");
	void output(const Duty* duty, const vector<Segment*>& segments, const string logPrefix = "COMMOON");
	void output(const Duty* duty, const Segment* segment, const string logPrefix = "COMMOON");

	void output(const long long pairingId, SharedPtr<CrewDataContext>& dbData, const string logPrefix = "COMMOON");

private:

	static std::shared_ptr<DebugUtils> _debugUtils;

	bool _enabled = true;
};