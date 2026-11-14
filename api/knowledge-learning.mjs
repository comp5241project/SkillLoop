import { handleLearningRequest } from '../knowledge-map/learning-api.mjs';

// The runtime supplies a second argument; the internal handler reserves it for test injection.
export default { fetch: (request) => handleLearningRequest(request) };
