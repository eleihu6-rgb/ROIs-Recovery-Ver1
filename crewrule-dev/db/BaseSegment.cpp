#include "BaseSegment.h"

BaseSegment::BaseSegment() {
	init();
}

void BaseSegment::init() {
	_id = 0;
	_dbid = 0;
	//_segNumber = 0;
	_blkTime = 0;

	_schStartTimeUtc = 0;
	_schEndTimeUtc = 0;
	_schStartTimeLoc = 0;
	_schEndTimeLoc = 0;
	_actStartTimeUtc = 0;
	_actEndTimeUtc = 0;
	_actStartTimeLoc = 0;
	_actEndTimeLoc = 0;

	_estDepDtUtc = 0;
	_estDepDtLoc = 0;
	_estArvDtUtc = 0;
	_estArvDtLoc = 0;

	_compositionId = 0;
	_compositionHierarchy = 0;
	_turnTime = 0;
	_isOperating = false; // fly segment or deadhead segment
	_isDeadhead = false;
	_isCovered = false;
	_historicalBlock = false;
	_blk_min_history = 0;
	_ftTime = 0;
}

bool BaseSegment::fillCompositionRank(const string &rank, int fillValue) {
	if (_openComposition.find(rank) == _openComposition.end()) {
		return false;
	}

	int openValue = _openComposition[rank];
	if (openValue >= fillValue) {
		_openComposition[rank] = openValue - fillValue;
		_fillComposition[rank] = _fillComposition[rank] + fillValue;
		return true;
	}
	else {
		_openComposition[rank] = 0;
		_fillComposition[rank] = _fillComposition[rank] + fillValue;
		return true;
	}
}