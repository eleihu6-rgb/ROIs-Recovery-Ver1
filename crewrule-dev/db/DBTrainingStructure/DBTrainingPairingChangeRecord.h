//
// Created by haoli on 2025/11/20.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPAIRINGCHANGERECORD_H
#define TRAININGOPTIMIZER_DBTRAININGPAIRINGCHANGERECORD_H


class DBTrainingPairingChangeRecord {
public:
    DBTrainingPairingChangeRecord() = default;

    DBTrainingPairingChangeRecord(long long recordId, long long originalPairingId, long long createdPairingId) :
            _recordId(recordId), _originalPairingId(originalPairingId), _createdPairingId(createdPairingId) {}

    const long long GetRecordId() const { return _recordId;}
    void SetRecordId(long long recordId) {_recordId = recordId;}

    const long long GetOriginalPairingId() const { return _originalPairingId;}
    void SetOriginalPairingId(long long originalPairingId) {_originalPairingId = originalPairingId;}

    const long long GetCreatedPairingId() const { return _createdPairingId;}
    void SetCreatedPairingId(long long createdPairingId) {_createdPairingId = createdPairingId;}


private:
    long long _recordId{0};
    long long _originalPairingId{0};
    long long _createdPairingId{0};
};


#endif //TRAININGOPTIMIZER_DBTRAININGPAIRINGCHANGERECORD_H
